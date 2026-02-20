"""Stripe billing endpoints — checkout session, webhook, portal."""

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
import stripe
import logging

from app.core.config import settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User, SubscriptionTier, SubscriptionStatus
from app.schemas.auth import (
    CreateCheckoutSession,
    CheckoutSessionResponse,
    SubscriptionInfo,
)

logger = logging.getLogger("gefo.billing")
router = APIRouter(prefix="/api/billing", tags=["billing"])


# ─── Tier → Stripe price mapping ───

TIER_PRICE_MAP = {
    "pro": settings.stripe_pro_price_id,
    "institutional": settings.stripe_institutional_price_id,
}


# ─── Create checkout session ───


@router.post("/checkout", response_model=CheckoutSessionResponse)
def create_checkout(
    body: CreateCheckoutSession,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a Stripe Checkout Session for upgrading."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe.api_key = settings.stripe_secret_key
    price_id = TIER_PRICE_MAP.get(body.tier)
    if not price_id:
        raise HTTPException(status_code=400, detail=f"Unknown tier: {body.tier}")

    # Create or reuse Stripe customer
    if not user.stripe_customer_id:
        customer = stripe.Customer.create(
            email=user.email,
            name=user.full_name or user.email,
            metadata={"gefo_user_id": str(user.id)},
        )
        user.stripe_customer_id = customer.id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=user.stripe_customer_id,
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        metadata={"gefo_user_id": str(user.id), "tier": body.tier},
    )

    return CheckoutSessionResponse(
        checkout_url=session.url,
        session_id=session.id,
    )


# ─── Customer portal ───


@router.post("/portal")
def create_portal_session(
    user: User = Depends(get_current_user),
):
    """Create a Stripe Customer Portal session for managing subscription."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No active subscription")

    stripe.api_key = settings.stripe_secret_key
    session = stripe.billing_portal.Session.create(
        customer=user.stripe_customer_id,
        return_url="http://localhost:3000/account",
    )

    return {"portal_url": session.url}


# ─── Stripe Webhook ───


@router.post("/webhook", include_in_schema=False)
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    """Handle Stripe webhook events for subscription lifecycle."""
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(status_code=503, detail="Stripe not configured")

    stripe.api_key = settings.stripe_secret_key
    payload = await request.body()

    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, settings.stripe_webhook_secret
        )
    except (ValueError, stripe.error.SignatureVerificationError) as e:
        logger.warning(f"Webhook signature verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event["type"]
    data = event["data"]["object"]

    logger.info(f"Stripe webhook: {event_type}")

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data, db)
    elif event_type == "customer.subscription.updated":
        _handle_subscription_updated(data, db)
    elif event_type == "customer.subscription.deleted":
        _handle_subscription_deleted(data, db)
    elif event_type == "invoice.payment_failed":
        _handle_payment_failed(data, db)

    return {"status": "ok"}


# ─── Webhook handlers ───


def _handle_checkout_completed(session: dict, db: Session):
    customer_id = session.get("customer")
    subscription_id = session.get("subscription")
    tier_str = session.get("metadata", {}).get("tier", "pro")

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        logger.warning(f"No user for Stripe customer {customer_id}")
        return

    tier = SubscriptionTier.PRO if tier_str == "pro" else SubscriptionTier.INSTITUTIONAL
    user.tier = tier
    user.subscription_status = SubscriptionStatus.ACTIVE
    user.stripe_subscription_id = subscription_id
    db.commit()
    logger.info(f"User {user.email} upgraded to {tier.value}")


def _handle_subscription_updated(subscription: dict, db: Session):
    customer_id = subscription.get("customer")
    status = subscription.get("status")

    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    status_map = {
        "active": SubscriptionStatus.ACTIVE,
        "past_due": SubscriptionStatus.PAST_DUE,
        "trialing": SubscriptionStatus.TRIALING,
        "canceled": SubscriptionStatus.CANCELLED,
        "unpaid": SubscriptionStatus.PAST_DUE,
    }
    user.subscription_status = status_map.get(status, SubscriptionStatus.ACTIVE)
    db.commit()


def _handle_subscription_deleted(subscription: dict, db: Session):
    customer_id = subscription.get("customer")
    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    user.tier = SubscriptionTier.FREE
    user.subscription_status = SubscriptionStatus.CANCELLED
    user.stripe_subscription_id = None
    db.commit()
    logger.info(f"User {user.email} downgraded to free (subscription cancelled)")


def _handle_payment_failed(invoice: dict, db: Session):
    customer_id = invoice.get("customer")
    user = db.query(User).filter(User.stripe_customer_id == customer_id).first()
    if not user:
        return

    user.subscription_status = SubscriptionStatus.PAST_DUE
    db.commit()
    logger.warning(f"Payment failed for {user.email}")
