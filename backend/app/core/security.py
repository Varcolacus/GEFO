"""Authentication & authorisation utilities — JWT, passwords, API keys."""

from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
import hashlib

from fastapi import Depends, HTTPException, status, Security
from fastapi.security import OAuth2PasswordBearer, APIKeyHeader
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User, APIKey, SubscriptionTier

# ─── Password hashing ───

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ─── OAuth2 scheme (JWT bearer) ───

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# ─── API-key header scheme ───

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)

# ─── Constants ───

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours


# ─── Password helpers ───

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ─── JWT helpers ───

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])


# ─── API-key helpers ───

def generate_api_key() -> tuple[str, str, str]:
    """Return (raw_key, key_prefix, key_hash)."""
    raw = f"gefo_{secrets.token_urlsafe(32)}"
    prefix = raw[:12]
    key_hash = hashlib.sha256(raw.encode()).hexdigest()
    return raw, prefix, key_hash


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ─── Dependency: get current user from JWT ───

def _get_user_from_token(token: str, db: Session) -> Optional[User]:
    try:
        payload = decode_access_token(token)
        user_id_str = payload.get("sub")
        if user_id_str is None:
            return None
        user_id = int(user_id_str)
    except (JWTError, ValueError):
        return None
    user = db.query(User).filter(User.id == user_id).first()
    if user and user.is_active:
        return user
    return None


def _get_user_from_api_key(api_key: str, db: Session) -> Optional[User]:
    key_hash = hash_api_key(api_key)
    ak = (
        db.query(APIKey)
        .filter(APIKey.key_hash == key_hash, APIKey.is_active == True)
        .first()
    )
    if ak is None:
        return None
    # Check expiry
    if ak.expires_at and ak.expires_at < datetime.now(timezone.utc):
        return None
    # Update usage stats
    ak.request_count += 1
    ak.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return ak.user


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
    db: Session = Depends(get_db),
) -> User:
    """Authenticate via JWT bearer token OR X-API-Key header."""
    user = None

    # Try JWT first
    if token:
        user = _get_user_from_token(token, db)

    # Fall back to API key
    if user is None and api_key:
        user = _get_user_from_api_key(api_key, db)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_user_optional(
    token: Optional[str] = Depends(oauth2_scheme),
    api_key: Optional[str] = Security(api_key_header),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Same as above but returns None instead of 401 — for optional auth."""
    user = None
    if token:
        user = _get_user_from_token(token, db)
    if user is None and api_key:
        user = _get_user_from_api_key(api_key, db)
    return user


async def get_admin_user(
    user: User = Depends(get_current_user),
) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


# ─── Tier-based access control ───

TIER_LIMITS = {
    SubscriptionTier.FREE: {
        "requests_per_minute": 10,
        "requests_per_day": 100,
        "max_api_keys": 1,
        "csv_export": False,
        "intelligence_access": False,
    },
    SubscriptionTier.PRO: {
        "requests_per_minute": 60,
        "requests_per_day": 5000,
        "max_api_keys": 5,
        "csv_export": True,
        "intelligence_access": True,
    },
    SubscriptionTier.INSTITUTIONAL: {
        "requests_per_minute": 300,
        "requests_per_day": 50000,
        "max_api_keys": 20,
        "csv_export": True,
        "intelligence_access": True,
    },
}


def require_tier(*allowed_tiers: SubscriptionTier):
    """Dependency factory that enforces subscription tier."""
    async def _check(user: User = Depends(get_current_user)):
        if user.tier not in allowed_tiers:
            raise HTTPException(
                status_code=403,
                detail=f"This endpoint requires one of: {[t.value for t in allowed_tiers]}. "
                       f"Your tier: {user.tier.value}",
            )
        return user
    return _check
