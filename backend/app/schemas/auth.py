"""Pydantic schemas for authentication, users, API keys, and subscriptions."""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime


# ─── Auth ───


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = None
    organisation: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: "UserProfile"


class TokenRefresh(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


# ─── User Profile ───


class UserProfile(BaseModel):
    id: int
    email: str
    full_name: Optional[str]
    organisation: Optional[str]
    tier: str
    subscription_status: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    api_key_count: int = 0

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    organisation: Optional[str] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ─── API Key ───


class APIKeyCreate(BaseModel):
    label: Optional[str] = Field(None, max_length=100)


class APIKeyResponse(BaseModel):
    id: int
    key_prefix: str
    label: Optional[str]
    is_active: bool
    created_at: datetime
    last_used_at: Optional[datetime]
    expires_at: Optional[datetime]
    request_count: int

    class Config:
        from_attributes = True


class APIKeyCreated(BaseModel):
    """Returned once when key is first created — contains the raw key."""
    id: int
    key: str  # raw key — only shown once
    key_prefix: str
    label: Optional[str]


# ─── Subscription ───


class SubscriptionInfo(BaseModel):
    tier: str
    status: str
    limits: dict
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None


class CreateCheckoutSession(BaseModel):
    tier: str = Field(..., pattern="^(pro|institutional)$")
    success_url: str = "http://localhost:3000/account?status=success"
    cancel_url: str = "http://localhost:3000/account?status=cancel"


class CheckoutSessionResponse(BaseModel):
    checkout_url: str
    session_id: str


# ─── Admin ___


class AdminUserList(BaseModel):
    total: int
    users: List[UserProfile]
