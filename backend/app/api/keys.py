"""API key management endpoints — create, list, revoke."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.core.database import get_db
from app.core.security import (
    get_current_user,
    generate_api_key,
    TIER_LIMITS,
)
from app.models.user import User, APIKey
from app.schemas.auth import APIKeyCreate, APIKeyResponse, APIKeyCreated

router = APIRouter(prefix="/api/keys", tags=["api-keys"])


@router.post("/", response_model=APIKeyCreated, status_code=201)
def create_key(
    body: APIKeyCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Generate a new API key. The raw key is shown only once."""
    max_keys = TIER_LIMITS[user.tier]["max_api_keys"]
    active_count = (
        db.query(APIKey)
        .filter(APIKey.user_id == user.id, APIKey.is_active == True)
        .count()
    )
    if active_count >= max_keys:
        raise HTTPException(
            status_code=403,
            detail=f"Maximum API keys ({max_keys}) reached for {user.tier.value} tier. "
                   "Revoke an existing key or upgrade your plan.",
        )

    raw, prefix, key_hash = generate_api_key()

    ak = APIKey(
        user_id=user.id,
        key_hash=key_hash,
        key_prefix=prefix,
        label=body.label,
    )
    db.add(ak)
    db.commit()
    db.refresh(ak)

    return APIKeyCreated(
        id=ak.id,
        key=raw,
        key_prefix=prefix,
        label=ak.label,
    )


@router.get("/", response_model=List[APIKeyResponse])
def list_keys(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all API keys for the current user (raw key is never re-shown)."""
    keys = (
        db.query(APIKey)
        .filter(APIKey.user_id == user.id)
        .order_by(APIKey.created_at.desc())
        .all()
    )
    return keys


@router.delete("/{key_id}", status_code=204)
def revoke_key(
    key_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revoke (deactivate) an API key."""
    ak = (
        db.query(APIKey)
        .filter(APIKey.id == key_id, APIKey.user_id == user.id)
        .first()
    )
    if not ak:
        raise HTTPException(status_code=404, detail="API key not found")
    ak.is_active = False
    db.commit()
