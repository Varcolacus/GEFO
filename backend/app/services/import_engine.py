"""
Import engine service — Phase 9.

Handles:
  1. CSV / Excel file parsing (with encoding detection)
  2. Preview generation (first N rows + auto column mapping)
  3. Validated bulk import into target tables
  4. Import job tracking (progress, errors, status)
  5. External API fetching (UN Comtrade, World Bank stubs)
"""

from __future__ import annotations

import csv
import io
import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import chardet
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text as sqla_text

from app.core.database import SessionLocal
from app.models.import_job import ImportJob, DataSource
from app.models.trade_flow import TradeFlow
from app.models.country import Country
from app.models.port import Port
from app.models.shipping_density import ShippingDensity
from app.services.validation import (
    auto_map_columns,
    validate_rows,
    get_table_schemas,
    TABLE_SCHEMAS,
)

logger = logging.getLogger("gefo.import_engine")

# Upload directory
UPLOAD_DIR = os.path.join(tempfile.gettempdir(), "gefo_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Model registry for dynamic insertion
TABLE_MODELS = {
    "trade_flows": TradeFlow,
    "countries": Country,
    "ports": Port,
    "shipping_density": ShippingDensity,
}

BATCH_SIZE = 500  # rows per bulk insert batch


# ═══════════════════════════════════════════════════════════════════
#  1. FILE PARSING
# ═══════════════════════════════════════════════════════════════════

def _detect_encoding(file_bytes: bytes) -> str:
    """Detect file encoding using chardet."""
    result = chardet.detect(file_bytes[:50000])
    return result.get("encoding", "utf-8") or "utf-8"


def parse_csv(file_bytes: bytes) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Parse CSV bytes into column headers and row dicts."""
    encoding = _detect_encoding(file_bytes)
    text = file_bytes.decode(encoding, errors="replace")

    # Detect delimiter
    sample = text[:5000]
    sniffer = csv.Sniffer()
    try:
        dialect = sniffer.sniff(sample, delimiters=",;\t|")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    columns = reader.fieldnames or []
    rows = [dict(row) for row in reader]
    return list(columns), rows


def parse_excel(file_bytes: bytes, sheet_name: Optional[str] = None) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Parse Excel (.xlsx/.xls) bytes into column headers and row dicts."""
    buf = io.BytesIO(file_bytes)
    df = pd.read_excel(buf, sheet_name=sheet_name or 0, engine="openpyxl")
    df = df.where(pd.notna(df), None)  # Replace NaN with None
    columns = [str(c) for c in df.columns]
    rows = df.to_dict(orient="records")
    return columns, rows


def parse_file(
    file_bytes: bytes, filename: str, sheet_name: Optional[str] = None
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Auto-detect format and parse file."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in (".xlsx", ".xls"):
        return parse_excel(file_bytes, sheet_name)
    elif ext == ".json":
        data = json.loads(file_bytes.decode(_detect_encoding(file_bytes)))
        if isinstance(data, list) and data:
            columns = list(data[0].keys()) if isinstance(data[0], dict) else []
            return columns, data
        return [], []
    else:  # csv, tsv, txt
        return parse_csv(file_bytes)


# ═══════════════════════════════════════════════════════════════════
#  2. PREVIEW
# ═══════════════════════════════════════════════════════════════════

def generate_preview(
    file_bytes: bytes,
    filename: str,
    target_table: str,
    preview_rows: int = 10,
) -> Dict[str, Any]:
    """
    Parse file, auto-map columns, return preview for user confirmation.
    """
    try:
        columns, rows = parse_file(file_bytes, filename)
    except Exception as e:
        return {"error": f"Failed to parse file: {str(e)}"}

    if not columns:
        return {"error": "No columns detected in file"}
    if not rows:
        return {"error": "No data rows found in file"}

    # Auto-detect column mapping
    mapping = auto_map_columns(columns, target_table)

    # Schema info
    schema = TABLE_SCHEMAS.get(target_table, {})
    required_cols = [c for c, s in schema.items() if s.get("required")]
    mapped_db_cols = set(mapping.values())
    missing_required = [c for c in required_cols if c not in mapped_db_cols]

    return {
        "filename": filename,
        "target_table": target_table,
        "total_rows": len(rows),
        "file_columns": columns,
        "auto_mapping": mapping,
        "missing_required": missing_required,
        "schema": {
            col: {"type": s["type"], "required": s.get("required", False)}
            for col, s in schema.items()
        },
        "preview_rows": [
            {col: row.get(col) for col in columns}
            for row in rows[:preview_rows]
        ],
    }


# ═══════════════════════════════════════════════════════════════════
#  3. IMPORT EXECUTION
# ═══════════════════════════════════════════════════════════════════

def execute_import(
    db: Session,
    job_id: int,
    file_bytes: bytes,
    filename: str,
    target_table: str,
    column_mapping: Dict[str, str],
    import_mode: str = "append",
    year_filter: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Execute the full import pipeline:
      1. Parse file
      2. Validate all rows
      3. Bulk insert/replace
      4. Update job record
    """
    job = db.query(ImportJob).get(job_id)
    if not job:
        return {"error": f"Job {job_id} not found"}

    # Update status
    job.status = "validating"
    job.started_at = datetime.now(timezone.utc)
    db.commit()

    # 1. Parse
    try:
        columns, rows = parse_file(file_bytes, filename)
    except Exception as e:
        _fail_job(db, job, f"Parse error: {e}")
        return {"error": str(e)}

    job.total_rows = len(rows)
    db.commit()

    if not rows:
        _fail_job(db, job, "No data rows found")
        return {"error": "No data rows found"}

    # 2. Validate
    valid_rows, warning_rows, errors = validate_rows(rows, target_table, column_mapping, db)

    # Combine valid + warning rows for import (warnings are still importable)
    importable = valid_rows + warning_rows
    job.valid_rows = len(importable)
    job.error_rows = len(set(e["row"] for e in errors))
    job.skipped_rows = job.total_rows - len(importable)
    job.error_log = errors[:500]  # cap error log at 500 entries
    job.progress_pct = 30.0
    db.commit()

    if not importable:
        _fail_job(db, job, f"No valid rows. {len(errors)} validation errors.")
        return {
            "error": "All rows failed validation",
            "errors": errors[:50],
            "total_errors": len(errors),
        }

    # 3. Insert
    job.status = "importing"
    db.commit()

    model_class = TABLE_MODELS.get(target_table)
    if not model_class:
        _fail_job(db, job, f"Unknown target table: {target_table}")
        return {"error": f"Unknown target table: {target_table}"}

    try:
        # Handle import mode
        if import_mode == "replace":
            if year_filter and hasattr(model_class, "year"):
                db.query(model_class).filter(model_class.year == year_filter).delete()
            else:
                db.query(model_class).delete()
            db.commit()

        # Bulk insert in batches
        imported_count = 0
        for i in range(0, len(importable), BATCH_SIZE):
            batch = importable[i : i + BATCH_SIZE]
            objects = []
            for row_data in batch:
                # Filter to only columns that exist on the model
                filtered = {
                    k: v for k, v in row_data.items()
                    if hasattr(model_class, k) and v is not None
                }
                objects.append(model_class(**filtered))

            db.bulk_save_objects(objects)
            db.commit()
            imported_count += len(batch)

            # Update progress (30% parse/validate + 70% insert)
            pct = 30 + (imported_count / len(importable) * 70)
            job.progress_pct = round(pct, 1)
            job.imported_rows = imported_count
            db.commit()

        # 4. Complete
        job.status = "completed"
        job.progress_pct = 100.0
        job.imported_rows = imported_count
        job.completed_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "status": "completed",
            "job_id": job.id,
            "total_rows": job.total_rows,
            "imported_rows": imported_count,
            "skipped_rows": job.skipped_rows,
            "error_rows": job.error_rows,
            "errors": errors[:20],
        }

    except Exception as e:
        db.rollback()
        _fail_job(db, job, f"Import error: {e}")
        logger.error("Import failed for job %d: %s", job_id, e, exc_info=True)
        return {"error": f"Import failed: {e}"}


def _fail_job(db: Session, job: ImportJob, message: str):
    """Mark job as failed."""
    job.status = "failed"
    job.error_summary = message
    job.completed_at = datetime.now(timezone.utc)
    db.commit()


# ═══════════════════════════════════════════════════════════════════
#  4. JOB MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

def create_import_job(
    db: Session,
    source_type: str,
    source_name: str,
    target_table: str,
    column_mapping: Optional[Dict] = None,
    import_mode: str = "append",
    year_filter: Optional[int] = None,
    user_id: Optional[int] = None,
) -> ImportJob:
    """Create a new import job record."""
    job = ImportJob(
        user_id=user_id,
        source_type=source_type,
        source_name=source_name,
        target_table=target_table,
        column_mapping=column_mapping,
        import_mode=import_mode,
        year_filter=year_filter,
        status="pending",
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def get_import_jobs(
    db: Session, limit: int = 20, status: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Get recent import jobs."""
    q = db.query(ImportJob).order_by(ImportJob.created_at.desc())
    if status:
        q = q.filter(ImportJob.status == status)
    jobs = q.limit(limit).all()

    return [
        {
            "id": j.id,
            "source_type": j.source_type,
            "source_name": j.source_name,
            "target_table": j.target_table,
            "status": j.status,
            "progress_pct": j.progress_pct,
            "total_rows": j.total_rows,
            "imported_rows": j.imported_rows,
            "error_rows": j.error_rows,
            "skipped_rows": j.skipped_rows,
            "import_mode": j.import_mode,
            "error_summary": j.error_summary,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None,
        }
        for j in jobs
    ]


def get_import_job_detail(db: Session, job_id: int) -> Optional[Dict[str, Any]]:
    """Get full detail of a single import job including error log."""
    j = db.query(ImportJob).get(job_id)
    if not j:
        return None
    return {
        "id": j.id,
        "source_type": j.source_type,
        "source_name": j.source_name,
        "target_table": j.target_table,
        "status": j.status,
        "progress_pct": j.progress_pct,
        "total_rows": j.total_rows,
        "valid_rows": j.valid_rows,
        "imported_rows": j.imported_rows,
        "error_rows": j.error_rows,
        "skipped_rows": j.skipped_rows,
        "column_mapping": j.column_mapping,
        "import_mode": j.import_mode,
        "year_filter": j.year_filter,
        "error_log": j.error_log,
        "error_summary": j.error_summary,
        "preview_data": j.preview_data,
        "created_at": j.created_at.isoformat() if j.created_at else None,
        "started_at": j.started_at.isoformat() if j.started_at else None,
        "completed_at": j.completed_at.isoformat() if j.completed_at else None,
    }


# ═══════════════════════════════════════════════════════════════════
#  5. DATA SOURCE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

def get_data_sources(db: Session) -> List[Dict[str, Any]]:
    """Get all registered data sources."""
    sources = db.query(DataSource).order_by(DataSource.name).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "source_type": s.source_type,
            "url": s.url,
            "target_table": s.target_table,
            "schedule_cron": s.schedule_cron,
            "is_active": s.is_active,
            "last_fetch_at": s.last_fetch_at.isoformat() if s.last_fetch_at else None,
            "last_status": s.last_status,
        }
        for s in sources
    ]


def create_data_source(
    db: Session,
    name: str,
    source_type: str,
    target_table: str,
    url: Optional[str] = None,
    api_key: Optional[str] = None,
    schedule_cron: Optional[str] = None,
    config: Optional[Dict] = None,
) -> Dict[str, Any]:
    """Register a new external data source."""
    ds = DataSource(
        name=name,
        source_type=source_type,
        url=url,
        api_key=api_key,
        target_table=target_table,
        schedule_cron=schedule_cron,
        config=config,
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return {
        "id": ds.id,
        "name": ds.name,
        "source_type": ds.source_type,
        "target_table": ds.target_table,
    }


# ═══════════════════════════════════════════════════════════════════
#  6. TABLE STATS (for import dashboard)
# ═══════════════════════════════════════════════════════════════════

def get_table_stats(db: Session) -> Dict[str, Any]:
    """Get row counts and basic stats for importable tables."""
    stats = {}
    for table_name, model in TABLE_MODELS.items():
        try:
            count = db.query(model).count()
            year_range = None
            if hasattr(model, "year"):
                from sqlalchemy import func as sqlfunc
                yr = db.query(
                    sqlfunc.min(model.year), sqlfunc.max(model.year)
                ).first()
                if yr and yr[0]:
                    year_range = {"min": yr[0], "max": yr[1]}

            stats[table_name] = {
                "row_count": count,
                "year_range": year_range,
            }
        except Exception as e:
            stats[table_name] = {"row_count": 0, "error": str(e)}

    return stats
