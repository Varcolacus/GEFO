"""
Intelligence API Router — Phase 2
──────────────────────────────────
Endpoints for GEFO proprietary indicators:
  - /api/intelligence/tfii          Trade Flow Intensity Index
  - /api/intelligence/port-stress   Port Stress Indicator
  - /api/intelligence/energy        Energy Corridor Exposure Index
  - /api/intelligence/chokepoints   Chokepoint Monitoring
  - /api/intelligence/baselines     Historical Baselines & Z-Scores
  - /api/intelligence/dashboard     Combined Intelligence Dashboard
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import logging

from app.core.database import get_db
from app.services.tfii import compute_corridor_tfii, compute_country_tfii
from app.services.port_stress import compute_port_stress, compute_port_stress_summary
from app.services.energy_corridor import (
    compute_energy_corridor_exposure,
    compute_chokepoint_energy_summary,
)
from app.services.chokepoint_monitor import (
    monitor_chokepoints,
    get_chokepoint_history,
)
from app.services.baseline import (
    compute_trade_baselines,
    compute_country_trade_baseline,
    compute_density_baselines,
    compute_all_baselines,
)

logger = logging.getLogger("gefo.api.intelligence")
router = APIRouter(prefix="/api/intelligence", tags=["Intelligence"])


# ─────────────────────────────────────────────────────────────────────────────
# TFII — Trade Flow Intensity Index
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/tfii/corridors")
def get_corridor_tfii(
    year: int = Query(2023, description="Reference year"),
    top_n: int = Query(50, le=200, description="Number of corridors to return"),
    db: Session = Depends(get_db),
):
    """
    Trade Flow Intensity Index by bilateral corridor.
    High TFII = high trade value relative to shipping congestion (efficient route).
    Low TFII = congested route relative to trade value.
    """
    logger.info(f"GET /intelligence/tfii/corridors — year={year}, top_n={top_n}")
    results = compute_corridor_tfii(db, year, top_n)
    return {
        "indicator": "Trade Flow Intensity Index (TFII)",
        "year": year,
        "count": len(results),
        "corridors": results,
    }


@router.get("/tfii/countries")
def get_country_tfii(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """
    Country-level TFII (weighted average across all corridors).
    """
    logger.info(f"GET /intelligence/tfii/countries — year={year}")
    results = compute_country_tfii(db, year)
    return {
        "indicator": "Country TFII",
        "year": year,
        "count": len(results),
        "countries": results,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Port Stress
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/port-stress")
def get_port_stress(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """
    Port Stress Indicator for all tracked ports.
    PSI combines throughput ratio, nearby shipping density, and utilization.
    """
    logger.info(f"GET /intelligence/port-stress — year={year}")
    results = compute_port_stress(db, year)
    return {
        "indicator": "Port Stress Indicator (PSI)",
        "year": year,
        "count": len(results),
        "ports": results,
    }


@router.get("/port-stress/summary")
def get_port_stress_summary(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """Aggregate port stress statistics and top/bottom stressed ports."""
    logger.info(f"GET /intelligence/port-stress/summary — year={year}")
    return compute_port_stress_summary(db, year)


# ─────────────────────────────────────────────────────────────────────────────
# Energy Corridor Exposure
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/energy/exposure")
def get_energy_exposure(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """
    Energy Corridor Exposure Index by country.
    Measures trade dependency on energy-sensitive maritime chokepoints.
    """
    logger.info(f"GET /intelligence/energy/exposure — year={year}")
    results = compute_energy_corridor_exposure(db, year)
    return {
        "indicator": "Energy Corridor Exposure Index (ECEI)",
        "year": year,
        "count": len(results),
        "countries": results,
    }


@router.get("/energy/summary")
def get_energy_summary(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """Trade transit summary through each energy-sensitive chokepoint."""
    logger.info(f"GET /intelligence/energy/summary — year={year}")
    return {
        "indicator": "Energy Chokepoint Summary",
        "year": year,
        "chokepoints": compute_chokepoint_energy_summary(db, year),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Chokepoint Monitoring
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/chokepoints")
def get_chokepoints(
    year: int = Query(2023, description="Current monitoring year"),
    db: Session = Depends(get_db),
):
    """
    Monitor 6 strategic maritime chokepoints.
    Returns current density, 5-year baseline, z-score, and stress level.
    """
    logger.info(f"GET /intelligence/chokepoints — year={year}")
    results = monitor_chokepoints(db, year)
    return {
        "indicator": "Chokepoint Stress Monitor",
        "year": year,
        "count": len(results),
        "chokepoints": results,
    }


@router.get("/chokepoints/{name}")
def get_chokepoint_detail(
    name: str,
    db: Session = Depends(get_db),
):
    """
    Historical density data for a specific chokepoint.
    Name options: Strait of Hormuz, Suez Canal, Panama Canal,
                  Strait of Malacca, Bab el-Mandeb, English Channel
    """
    # URL-decode spaces
    chokepoint_name = name.replace("-", " ").replace("_", " ").title()
    logger.info(f"GET /intelligence/chokepoints/{chokepoint_name}")
    result = get_chokepoint_history(db, chokepoint_name)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Historical Baselines & Z-Scores
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/baselines")
def get_baselines(
    year: int = Query(2023, description="Current reference year"),
    db: Session = Depends(get_db),
):
    """
    Combined historical baselines and z-scores for global metrics.
    """
    logger.info(f"GET /intelligence/baselines — year={year}")
    return compute_all_baselines(db, year)


@router.get("/baselines/trade")
def get_trade_baseline(
    year: int = Query(2023, description="Current reference year"),
    db: Session = Depends(get_db),
):
    """Global trade volume baseline with z-score and trend."""
    logger.info(f"GET /intelligence/baselines/trade — year={year}")
    return compute_trade_baselines(db, year)


@router.get("/baselines/density")
def get_density_baseline(
    year: int = Query(2023, description="Current reference year"),
    db: Session = Depends(get_db),
):
    """Global shipping density baseline with z-score and trend."""
    logger.info(f"GET /intelligence/baselines/density — year={year}")
    return compute_density_baselines(db, year)


@router.get("/baselines/country/{iso_code}")
def get_country_baseline(
    iso_code: str,
    year: int = Query(2023, description="Current reference year"),
    db: Session = Depends(get_db),
):
    """Per-country trade baseline with z-scores for exports, imports, openness."""
    logger.info(f"GET /intelligence/baselines/country/{iso_code} — year={year}")
    result = compute_country_trade_baseline(db, iso_code, year)
    if "error" in result:
        raise HTTPException(404, result["error"])
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Combined Intelligence Dashboard
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard")
def get_intelligence_dashboard(
    year: int = Query(2023, description="Reference year"),
    db: Session = Depends(get_db),
):
    """
    Combined intelligence dashboard with all Phase 2 indicators.
    Single endpoint for frontend consumption.
    """
    logger.info(f"GET /intelligence/dashboard — year={year}")

    # Chokepoints
    chokepoints = monitor_chokepoints(db, year)
    stressed = [c for c in chokepoints if c["stress_level"] in ("high", "critical")]

    # Port stress summary
    port_summary = compute_port_stress_summary(db, year)

    # Top TFII corridors
    top_tfii = compute_corridor_tfii(db, year, top_n=10)

    # Top energy-exposed countries
    energy = compute_energy_corridor_exposure(db, year)
    top_energy = energy[:10] if energy else []

    # Baselines
    baselines = compute_all_baselines(db, year)

    return {
        "year": year,
        "chokepoint_monitor": {
            "total": len(chokepoints),
            "stressed_count": len(stressed),
            "stressed": stressed,
            "all": chokepoints,
        },
        "port_stress": port_summary,
        "top_tfii_corridors": top_tfii,
        "energy_exposure": {
            "most_exposed": top_energy,
            "total_countries": len(energy),
        },
        "baselines": baselines,
        "alerts": _generate_alerts(chokepoints, port_summary, baselines),
    }


def _generate_alerts(chokepoints, port_summary, baselines) -> List[dict]:
    """Generate alert messages from intelligence data."""
    alerts = []

    # Chokepoint alerts
    for cp in chokepoints:
        if cp["stress_level"] == "critical":
            alerts.append({
                "severity": "critical",
                "type": "chokepoint",
                "message": f"{cp['name']}: CRITICAL stress (z={cp['z_score']:.2f})",
                "details": cp,
            })
        elif cp["stress_level"] == "high":
            alerts.append({
                "severity": "warning",
                "type": "chokepoint",
                "message": f"{cp['name']}: HIGH stress (z={cp['z_score']:.2f})",
                "details": cp,
            })

    # Port stress alerts
    if port_summary.get("most_stressed"):
        for p in port_summary["most_stressed"]:
            if p["stress_level"] in ("high", "critical"):
                alerts.append({
                    "severity": "warning",
                    "type": "port",
                    "message": f"Port {p['port_name']}: {p['stress_level']} stress (PSI={p['psi']:.2f})",
                    "details": p,
                })

    # Baseline anomaly alerts
    for m in baselines.get("metrics", []):
        if m.get("classification") in ("significant", "extreme"):
            direction = "above" if m.get("z_score", 0) > 0 else "below"
            alerts.append({
                "severity": "info",
                "type": "baseline",
                "message": f"{m['metric']}: {m['classification']} deviation {direction} baseline (z={m['z_score']:.2f})",
                "details": m,
            })

    alerts.sort(key=lambda a: {"critical": 0, "warning": 1, "info": 2}.get(a["severity"], 3))
    return alerts
