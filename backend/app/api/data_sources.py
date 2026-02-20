"""
API routes for national data source registry and CORS proxy.
Phase 11 — Globe merge.
"""
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.data_source import NationalDataSource, DataProvenance

router = APIRouter(prefix="/api/data-sources", tags=["Data Sources"])


# ────────────────────────────────────────
# List / detail endpoints
# ────────────────────────────────────────

@router.get("/")
def list_data_sources(
    tier: Optional[str] = None,
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    """List all registered national data sources."""
    q = db.query(NationalDataSource)
    if tier:
        q = q.filter(NationalDataSource.tier == tier)
    if active_only:
        q = q.filter(NationalDataSource.is_active == True)
    sources = q.order_by(NationalDataSource.country_iso).all()
    return {
        "count": len(sources),
        "sources": [
            {
                "id": s.id,
                "country_iso": s.country_iso,
                "iso2": s.iso2,
                "institution": s.institution,
                "api_url": s.api_url,
                "docs_url": s.docs_url,
                "auth_required": s.auth_required,
                "quality": s.quality,
                "coverage": s.coverage,
                "update_frequency": s.update_frequency,
                "data_format": s.data_format,
                "tier": s.tier,
                "is_active": s.is_active,
                "last_fetch_at": s.last_fetch_at,
                "last_fetch_status": s.last_fetch_status,
                "fetch_error_count": s.fetch_error_count,
                "circuit_breaker_until": s.circuit_breaker_until,
            }
            for s in sources
        ],
    }


@router.get("/by-country/{country_iso}")
def get_sources_for_country(country_iso: str, db: Session = Depends(get_db)):
    """Get all data sources for a specific country."""
    sources = (
        db.query(NationalDataSource)
        .filter(NationalDataSource.country_iso == country_iso.upper())
        .all()
    )
    if not sources:
        raise HTTPException(404, f"No data sources for {country_iso}")
    return {
        "country_iso": country_iso.upper(),
        "count": len(sources),
        "sources": [
            {
                "id": s.id,
                "institution": s.institution,
                "api_url": s.api_url,
                "docs_url": s.docs_url,
                "quality": s.quality,
                "coverage": s.coverage,
                "data_format": s.data_format,
                "tier": s.tier,
                "is_active": s.is_active,
                "last_fetch_at": s.last_fetch_at,
                "last_fetch_status": s.last_fetch_status,
            }
            for s in sources
        ],
    }


@router.get("/stats")
def data_source_stats(db: Session = Depends(get_db)):
    """Get data source statistics: counts by tier, format, status."""
    all_sources = db.query(NationalDataSource).all()
    by_tier = {}
    by_format = {}
    by_status = {"active": 0, "inactive": 0, "circuit_broken": 0}
    now = datetime.utcnow()

    for s in all_sources:
        by_tier[s.tier] = by_tier.get(s.tier, 0) + 1
        fmt = s.data_format or "unknown"
        by_format[fmt] = by_format.get(fmt, 0) + 1
        if s.circuit_breaker_until and s.circuit_breaker_until > now:
            by_status["circuit_broken"] += 1
        elif s.is_active:
            by_status["active"] += 1
        else:
            by_status["inactive"] += 1

    return {
        "total": len(all_sources),
        "by_tier": by_tier,
        "by_format": by_format,
        "by_status": by_status,
    }


# ────────────────────────────────────────
# Circuit breaker & fetch tracking
# ────────────────────────────────────────

CIRCUIT_BREAKER_THRESHOLD = 2
CIRCUIT_BREAKER_COOLDOWN = timedelta(seconds=60)


@router.post("/{source_id}/report-success")
def report_fetch_success(source_id: int, db: Session = Depends(get_db)):
    """Report a successful data fetch — resets circuit breaker."""
    src = db.query(NationalDataSource).get(source_id)
    if not src:
        raise HTTPException(404, "Data source not found")
    src.last_fetch_at = datetime.utcnow()
    src.last_fetch_status = "success"
    src.fetch_error_count = 0
    src.circuit_breaker_until = None
    db.commit()
    return {"status": "ok", "source_id": source_id}


@router.post("/{source_id}/report-error")
def report_fetch_error(source_id: int, db: Session = Depends(get_db)):
    """Report a failed data fetch — may trigger circuit breaker."""
    src = db.query(NationalDataSource).get(source_id)
    if not src:
        raise HTTPException(404, "Data source not found")
    src.last_fetch_at = datetime.utcnow()
    src.last_fetch_status = "error"
    src.fetch_error_count = (src.fetch_error_count or 0) + 1
    if src.fetch_error_count >= CIRCUIT_BREAKER_THRESHOLD:
        src.circuit_breaker_until = datetime.utcnow() + CIRCUIT_BREAKER_COOLDOWN
    db.commit()
    return {
        "status": "error_recorded",
        "error_count": src.fetch_error_count,
        "circuit_broken": src.circuit_breaker_until is not None,
    }


# ────────────────────────────────────────
# CORS proxy — forwards requests to national APIs
# ────────────────────────────────────────

@router.get("/proxy")
async def cors_proxy(
    url: str = Query(..., description="Target URL to proxy"),
    timeout: int = Query(15, description="Timeout in seconds"),
):
    """
    CORS proxy for national statistical APIs.
    Forwards GET request to the target URL and returns the response.
    Avoids browser CORS restrictions when calling government APIs.
    """
    # Basic URL validation
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "URL must start with http:// or https://")

    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": "GEFO/0.11.0 (Global Economic Flow Observatory)",
                    "Accept": "application/json, application/xml, text/csv, */*",
                },
            )
            content_type = resp.headers.get("content-type", "application/octet-stream")

            # Return JSON directly if possible
            if "json" in content_type:
                return {
                    "status": resp.status_code,
                    "content_type": content_type,
                    "data": resp.json(),
                }
            else:
                return {
                    "status": resp.status_code,
                    "content_type": content_type,
                    "data": resp.text[:500000],  # cap at 500KB text
                }
    except httpx.TimeoutException:
        raise HTTPException(504, f"Upstream timeout after {timeout}s")
    except httpx.RequestError as e:
        raise HTTPException(502, f"Proxy error: {str(e)}")


# ────────────────────────────────────────
# Provenance
# ────────────────────────────────────────

@router.get("/provenance/{entity_type}/{entity_id}")
def get_provenance(entity_type: str, entity_id: int, db: Session = Depends(get_db)):
    """Get data provenance for a specific entity."""
    records = (
        db.query(DataProvenance)
        .filter(
            DataProvenance.entity_type == entity_type,
            DataProvenance.entity_id == entity_id,
        )
        .all()
    )
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "provenance": [
            {
                "source_name": r.source_name,
                "source_url": r.source_url,
                "fetched_at": r.fetched_at,
                "data_year": r.data_year,
                "quality": r.quality,
            }
            for r in records
        ],
    }
