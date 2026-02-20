"""
Data validation & cleansing service — Phase 9.

Validates imported data against schema constraints, normalizes values,
detects and reports errors per row/field.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.country import Country

logger = logging.getLogger("gefo.validation")

# ═══════════════════════════════════════════════════════════════════
#  Schema definitions — expected columns + types + constraints
# ═══════════════════════════════════════════════════════════════════

TABLE_SCHEMAS: Dict[str, Dict[str, Dict[str, Any]]] = {
    "trade_flows": {
        "exporter_iso": {"type": "iso3", "required": True},
        "importer_iso": {"type": "iso3", "required": True},
        "year": {"type": "int", "required": True, "min": 1900, "max": 2100},
        "month": {"type": "int", "required": False, "min": 1, "max": 12},
        "commodity_code": {"type": "str", "required": False, "max_len": 10},
        "commodity_description": {"type": "str", "required": False, "max_len": 500},
        "trade_value_usd": {"type": "float", "required": True, "min": 0},
        "weight_kg": {"type": "float", "required": False, "min": 0},
        "flow_type": {"type": "enum", "required": True, "values": ["export", "import"]},
    },
    "countries": {
        "iso_code": {"type": "iso3", "required": True},
        "name": {"type": "str", "required": True, "max_len": 255},
        "region": {"type": "str", "required": False, "max_len": 100},
        "sub_region": {"type": "str", "required": False, "max_len": 100},
        "gdp": {"type": "float", "required": False, "min": 0},
        "gdp_per_capita": {"type": "float", "required": False, "min": 0},
        "trade_balance": {"type": "float", "required": False},
        "current_account": {"type": "float", "required": False},
        "export_value": {"type": "float", "required": False, "min": 0},
        "import_value": {"type": "float", "required": False, "min": 0},
        "population": {"type": "float", "required": False, "min": 0},
        "centroid_lat": {"type": "float", "required": False, "min": -90, "max": 90},
        "centroid_lon": {"type": "float", "required": False, "min": -180, "max": 180},
    },
    "ports": {
        "name": {"type": "str", "required": True, "max_len": 255},
        "country_iso": {"type": "iso3", "required": True},
        "lat": {"type": "float", "required": True, "min": -90, "max": 90},
        "lon": {"type": "float", "required": True, "min": -180, "max": 180},
        "port_type": {"type": "enum", "required": False, "values": ["container", "bulk", "oil", "general", "mixed"]},
        "throughput_teu": {"type": "float", "required": False, "min": 0},
        "throughput_tons": {"type": "float", "required": False, "min": 0},
        "year": {"type": "int", "required": False, "min": 1900, "max": 2100},
        "unlocode": {"type": "str", "required": False, "max_len": 10},
    },
    "shipping_density": {
        "region_name": {"type": "str", "required": False, "max_len": 255},
        "lat": {"type": "float", "required": True, "min": -90, "max": 90},
        "lon": {"type": "float", "required": True, "min": -180, "max": 180},
        "year": {"type": "int", "required": True, "min": 1900, "max": 2100},
        "month": {"type": "int", "required": True, "min": 1, "max": 12},
        "density_value": {"type": "float", "required": True, "min": 0},
        "vessel_type": {"type": "enum", "required": False, "values": ["cargo", "tanker", "bulk", "all"]},
    },
}

# ═══════════════════════════════════════════════════════════════════
#  Auto column mapping
# ═══════════════════════════════════════════════════════════════════

# Common aliases that map to canonical column names
COLUMN_ALIASES: Dict[str, List[str]] = {
    "exporter_iso": ["exporter", "exporter_country", "origin", "origin_iso", "reporter_iso", "reporter", "from"],
    "importer_iso": ["importer", "importer_country", "partner", "partner_iso", "destination", "dest_iso", "to"],
    "iso_code": ["iso", "iso3", "country_code", "code", "iso_alpha3"],
    "country_iso": ["country", "country_code", "iso"],
    "name": ["country_name", "country", "port_name"],
    "year": ["yr", "period_year"],
    "month": ["mo", "period_month", "mon"],
    "trade_value_usd": ["value", "trade_value", "value_usd", "amount", "usd_value", "tradevalue"],
    "weight_kg": ["weight", "netweight", "net_weight", "quantity_kg", "kg"],
    "flow_type": ["flow", "type", "direction", "trade_type"],
    "commodity_code": ["hs_code", "hs", "commodity", "product_code", "hs6", "hs4", "hs2"],
    "commodity_description": ["description", "product", "product_name", "commodity_name", "comm_desc"],
    "lat": ["latitude", "y"],
    "lon": ["longitude", "lng", "x"],
    "port_type": ["type", "category"],
    "throughput_teu": ["teu", "container_throughput"],
    "throughput_tons": ["tons", "tonnage", "cargo_tons"],
    "density_value": ["density", "value", "count"],
    "vessel_type": ["vessel", "ship_type"],
    "gdp": ["gross_domestic_product", "gdp_usd"],
    "population": ["pop", "total_population"],
    "region": ["continent", "world_region"],
    "unlocode": ["un_locode", "locode", "port_code"],
}


def auto_map_columns(file_columns: List[str], target_table: str) -> Dict[str, str]:
    """
    Auto-detect column mapping from file headers to DB columns.

    Returns {file_column: db_column} for matched columns.
    """
    schema = TABLE_SCHEMAS.get(target_table, {})
    mapping: Dict[str, str] = {}
    remaining_db_cols = set(schema.keys())

    # Normalize for matching
    def normalize(s: str) -> str:
        return re.sub(r"[^a-z0-9]", "", s.lower())

    # Pass 1: exact match (normalized)
    for fc in file_columns:
        fc_norm = normalize(fc)
        for db_col in list(remaining_db_cols):
            if fc_norm == normalize(db_col):
                mapping[fc] = db_col
                remaining_db_cols.discard(db_col)
                break

    # Pass 2: alias match
    for fc in file_columns:
        if fc in mapping:
            continue
        fc_norm = normalize(fc)
        for db_col in list(remaining_db_cols):
            aliases = COLUMN_ALIASES.get(db_col, [])
            for alias in aliases:
                if fc_norm == normalize(alias):
                    mapping[fc] = db_col
                    remaining_db_cols.discard(db_col)
                    break
            if fc in mapping:
                break

    return mapping


# ═══════════════════════════════════════════════════════════════════
#  Validation engine
# ═══════════════════════════════════════════════════════════════════

def _validate_field(
    value: Any, field_name: str, schema: Dict[str, Any], known_isos: set
) -> Tuple[Any, Optional[str]]:
    """
    Validate and coerce a single field value.

    Returns (cleaned_value, error_message_or_None).
    """
    ftype = schema["type"]
    required = schema.get("required", False)

    # Handle None / empty
    if value is None or (isinstance(value, str) and value.strip() == ""):
        if required:
            return None, f"{field_name} is required"
        return None, None

    # String coercion
    if isinstance(value, str):
        value = value.strip()

    # Type-specific validation
    if ftype == "int":
        try:
            val = int(float(value))
        except (ValueError, TypeError):
            return None, f"{field_name}: '{value}' is not a valid integer"
        if "min" in schema and val < schema["min"]:
            return None, f"{field_name}: {val} < minimum {schema['min']}"
        if "max" in schema and val > schema["max"]:
            return None, f"{field_name}: {val} > maximum {schema['max']}"
        return val, None

    elif ftype == "float":
        try:
            val = float(value)
        except (ValueError, TypeError):
            return None, f"{field_name}: '{value}' is not a valid number"
        if "min" in schema and val < schema["min"]:
            return None, f"{field_name}: {val} < minimum {schema['min']}"
        if "max" in schema and val > schema["max"]:
            return None, f"{field_name}: {val} > maximum {schema['max']}"
        return val, None

    elif ftype == "str":
        val = str(value)
        max_len = schema.get("max_len", 1000)
        if len(val) > max_len:
            val = val[:max_len]  # truncate with warning, not an error
        return val, None

    elif ftype == "iso3":
        val = str(value).upper().strip()
        if len(val) != 3 or not val.isalpha():
            return None, f"{field_name}: '{value}' is not a valid ISO-3 code"
        if known_isos and val not in known_isos:
            return val, f"{field_name}: '{val}' not found in countries table (warning)"
        return val, None

    elif ftype == "enum":
        val = str(value).lower().strip()
        allowed = schema.get("values", [])
        if val not in allowed:
            return None, f"{field_name}: '{value}' not in {allowed}"
        return val, None

    return value, None


def validate_rows(
    rows: List[Dict[str, Any]],
    target_table: str,
    column_mapping: Dict[str, str],
    db: Optional[Session] = None,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Validate all rows against table schema.

    Args:
        rows: list of dicts with file column names as keys
        target_table: destination table name
        column_mapping: {file_col: db_col}
        db: optional session for FK validation (ISO codes)

    Returns:
        (valid_rows, warning_rows, error_list)
        - valid_rows: list of dicts with db column names, coerced values
        - warning_rows: valid but with warnings (e.g., unknown ISO)
        - error_list: [{row: int, field: str, error: str}, ...]
    """
    schema = TABLE_SCHEMAS.get(target_table)
    if not schema:
        return [], [], [{"row": 0, "field": "", "error": f"Unknown table: {target_table}"}]

    # Load known ISO codes for FK validation
    known_isos: set = set()
    if db:
        try:
            isos = db.query(Country.iso_code).all()
            known_isos = {r[0] for r in isos}
        except Exception:
            pass

    # Reverse mapping: db_col → file_col
    reverse_map = {v: k for k, v in column_mapping.items()}

    valid_rows: List[Dict[str, Any]] = []
    warning_rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for row_idx, row in enumerate(rows):
        cleaned: Dict[str, Any] = {}
        row_errors: List[Dict[str, Any]] = []
        row_warnings: List[str] = []

        for db_col, col_schema in schema.items():
            file_col = reverse_map.get(db_col)
            raw_value = row.get(file_col) if file_col else None

            val, err = _validate_field(raw_value, db_col, col_schema, known_isos)
            if err:
                if "warning" in err.lower():
                    row_warnings.append(err)
                    cleaned[db_col] = val
                else:
                    row_errors.append({"row": row_idx + 1, "field": db_col, "error": err})
            else:
                cleaned[db_col] = val

        if row_errors:
            errors.extend(row_errors)
        elif row_warnings:
            warning_rows.append(cleaned)
        else:
            valid_rows.append(cleaned)

    return valid_rows, warning_rows, errors


def get_table_schemas() -> Dict[str, Dict]:
    """Return all available table schemas for the frontend."""
    result = {}
    for table, cols in TABLE_SCHEMAS.items():
        result[table] = {
            "columns": {
                col_name: {
                    "type": spec["type"],
                    "required": spec.get("required", False),
                }
                for col_name, spec in cols.items()
            },
            "required_columns": [c for c, s in cols.items() if s.get("required")],
        }
    return result
