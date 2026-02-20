from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from app.core.database import get_db
from app.models.port import Port
from app.schemas.schemas import PortResponse

router = APIRouter(prefix="/api/ports", tags=["Ports"])


@router.get("/", response_model=List[PortResponse])
def get_ports(
    country: Optional[str] = Query(None, description="Filter by country ISO code"),
    port_type: Optional[str] = Query(None, description="Filter by port type"),
    min_throughput: Optional[float] = Query(None, description="Minimum throughput TEU"),
    limit: int = Query(500, le=2000, description="Max results"),
    db: Session = Depends(get_db),
):
    """Get port locations with throughput data."""
    query = db.query(Port)

    if country:
        query = query.filter(Port.country_iso == country.upper())
    if port_type:
        query = query.filter(Port.port_type == port_type)
    if min_throughput:
        query = query.filter(Port.throughput_teu >= min_throughput)

    ports = query.order_by(Port.throughput_teu.desc().nullslast()).limit(limit).all()
    return ports


@router.get("/{port_id}", response_model=PortResponse)
def get_port(port_id: int, db: Session = Depends(get_db)):
    """Get a single port by ID."""
    port = db.query(Port).filter(Port.id == port_id).first()
    if not port:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Port {port_id} not found")
    return port
