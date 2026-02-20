"""Authentication endpoints — register, login, profile, password change."""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core.database import get_db
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    TIER_LIMITS,
)
from app.models.user import User, SubscriptionTier
from app.schemas.auth import (
    UserRegister,
    Token,
    UserProfile,
    UserUpdate,
    PasswordChange,
    SubscriptionInfo,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ─── Helpers ───


def _user_profile(user: User) -> UserProfile:
    return UserProfile(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        organisation=user.organisation,
        tier=user.tier.value,
        subscription_status=user.subscription_status.value,
        is_active=user.is_active,
        is_admin=user.is_admin,
        created_at=user.created_at,
        api_key_count=len(user.api_keys),
    )


# ─── Register ───


@router.post("/register", response_model=Token, status_code=201)
def register(body: UserRegister, db: Session = Depends(get_db)):
    """Create a new user account (Free tier)."""
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        organisation=body.organisation,
        tier=SubscriptionTier.FREE,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(
        data={"sub": str(user.id), "tier": user.tier.value},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return Token(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_profile(user),
    )


# ─── Login (OAuth2 form) ───


@router.post("/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Authenticate with email + password. Returns JWT."""
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    access_token = create_access_token(
        data={"sub": str(user.id), "tier": user.tier.value},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return Token(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=_user_profile(user),
    )


# ─── Profile ───


@router.get("/me", response_model=UserProfile)
def get_me(user: User = Depends(get_current_user)):
    """Get current user profile."""
    return _user_profile(user)


@router.patch("/me", response_model=UserProfile)
def update_me(
    body: UserUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update current user profile fields."""
    if body.full_name is not None:
        user.full_name = body.full_name
    if body.organisation is not None:
        user.organisation = body.organisation
    db.commit()
    db.refresh(user)
    return _user_profile(user)


@router.post("/change-password", status_code=204)
def change_password(
    body: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change current user's password."""
    if not verify_password(body.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(body.new_password)
    db.commit()


# ─── Subscription info ───


@router.get("/subscription", response_model=SubscriptionInfo)
def get_subscription(user: User = Depends(get_current_user)):
    """Get current subscription tier and limits."""
    return SubscriptionInfo(
        tier=user.tier.value,
        status=user.subscription_status.value,
        limits=TIER_LIMITS.get(user.tier, TIER_LIMITS[SubscriptionTier.FREE]),
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
    )
