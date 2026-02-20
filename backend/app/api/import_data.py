"""
Data Pipeline & Import API — Phase 9
────────────────────────────────────
Endpoints:
  POST /api/import/upload          Upload file + get preview
  POST /api/import/execute         Execute import with column mapping
  GET  /api/import/jobs            List import jobs
  GET  /api/import/jobs/{id}       Get job detail + error log
  GET  /api/import/schemas         Get target table schemas
  GET  /api/import/stats           Get table row counts
  GET  /api/import/connectors      List available external connectors
  POST /api/import/sources         Register a data source
  GET  /api/import/sources         List registered data sources
"""

import os
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import get_admin_user
from app.models.user import User
from app.services.import_engine import (
    generate_preview,
    execute_import,
    create_import_job,
    get_import_jobs,
    get_import_job_detail,
    get_data_sources,
    create_data_source,
    get_table_stats,
    UPLOAD_DIR,
)
from app.services.validation import get_table_schemas
from app.services.connectors import get_available_connectors

logger = logging.getLogger("gefo.api.import")
router = APIRouter(prefix="/api/import", tags=["import"])

MAX_UPLOAD_SIZE = 50 * 1024 * 1024  # 50 MB


# ── Upload & Preview ──────────────────────────────────────────────

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    target_table: str = Form("trade_flows"),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Upload a CSV/Excel file and get a preview with auto-detected column mapping.
    """
    # Validate target table
    schemas = get_table_schemas()
    if target_table not in schemas:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid target table. Must be one of: {list(schemas.keys())}",
        )

    # Validate file type
    filename = file.filename or "unknown.csv"
    ext = os.path.splitext(filename)[1].lower()
    if ext not in (".csv", ".tsv", ".xlsx", ".xls", ".json", ".txt"):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {ext}. Use CSV, Excel, JSON, or TSV.",
        )

    # Read file
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum: {MAX_UPLOAD_SIZE // (1024*1024)} MB",
        )

    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    # Save to temp
    filepath = os.path.join(UPLOAD_DIR, f"{admin.id}_{filename}")
    with open(filepath, "wb") as f:
        f.write(content)

    # Generate preview
    preview = generate_preview(content, filename, target_table)
    if "error" in preview:
        raise HTTPException(status_code=400, detail=preview["error"])

    # Store temp path in preview for execute step
    preview["temp_file"] = filepath

    return preview


# ── Execute Import ────────────────────────────────────────────────

@router.post("/execute")
def execute_import_endpoint(
    temp_file: str = Form(...),
    target_table: str = Form("trade_flows"),
    column_mapping: str = Form(...),   # JSON string
    import_mode: str = Form("append"),
    year_filter: Optional[int] = Form(None),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """
    Execute import with user-confirmed column mapping.
    """
    import json

    # Validate
    if not os.path.exists(temp_file):
        raise HTTPException(status_code=400, detail="Upload file expired. Please re-upload.")

    try:
        mapping = json.loads(column_mapping)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid column_mapping JSON")

    if import_mode not in ("append", "replace", "upsert"):
        raise HTTPException(status_code=400, detail="import_mode must be append, replace, or upsert")

    # Read file
    with open(temp_file, "rb") as f:
        file_bytes = f.read()

    filename = os.path.basename(temp_file)

    # Create job
    job = create_import_job(
        db,
        source_type="csv" if filename.endswith((".csv", ".tsv", ".txt")) else "excel",
        source_name=filename,
        target_table=target_table,
        column_mapping=mapping,
        import_mode=import_mode,
        year_filter=year_filter,
        user_id=admin.id,
    )

    # Execute
    result = execute_import(
        db, job.id, file_bytes, filename, target_table, mapping, import_mode, year_filter
    )

    # Clean up temp file
    try:
        os.remove(temp_file)
    except OSError:
        pass

    if "error" in result:
        raise HTTPException(status_code=400, detail=result)

    return result


# ── Job Management ────────────────────────────────────────────────

@router.get("/jobs")
def list_import_jobs(
    limit: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """List recent import jobs."""
    return get_import_jobs(db, limit, status)


@router.get("/jobs/{job_id}")
def get_job_detail(
    job_id: int,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get detailed import job info including error log."""
    detail = get_import_job_detail(db, job_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Job not found")
    return detail


# ── Schema & Stats ────────────────────────────────────────────────

@router.get("/schemas")
def list_schemas(db: Session = Depends(get_db)):
    """Get all importable table schemas (columns, types, required fields)."""
    return get_table_schemas()


@router.get("/stats")
def table_stats(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Get row counts and year ranges for all importable tables."""
    return get_table_stats(db)


# ── External Connectors & Sources ─────────────────────────────────

@router.get("/connectors")
def list_connectors():
    """List available external data connectors."""
    return get_available_connectors()


@router.get("/sources")
def list_sources(
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """List registered data sources."""
    return get_data_sources(db)


@router.post("/sources")
def add_source(
    name: str = Form(...),
    source_type: str = Form(...),
    target_table: str = Form(...),
    url: Optional[str] = Form(None),
    api_key: Optional[str] = Form(None),
    schedule_cron: Optional[str] = Form(None),
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Register a new external data source."""
    valid_types = ["comtrade", "worldbank", "custom_api"]
    if source_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"source_type must be one of: {valid_types}")

    return create_data_source(db, name, source_type, target_table, url, api_key, schedule_cron)
