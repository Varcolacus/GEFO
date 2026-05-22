"""
Stripe webhook event log — used purely for idempotency.

Stripe retries failed webhook deliveries. Without an idempotency guard,
the same `checkout.session.completed` event arriving twice would try to
upgrade the user twice. By storing the event ID before processing, we
turn duplicate deliveries into safe no-ops.

Keep this table small and prune it. Stripe retries for up to 3 days
after the first attempt, so anything older than ~7 days is safe to
delete.
"""
from sqlalchemy import Column, DateTime, Integer, String
from sqlalchemy.sql import func

from app.core.database import Base


class StripeEvent(Base):
    __tablename__ = "stripe_events"

    id = Column(Integer, primary_key=True, index=True)
    # Stripe's evt_xxx identifier. Unique → uniqueness violation on INSERT
    # is how we detect a replay.
    stripe_event_id = Column(String(128), unique=True, nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    processed_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self):
        return f"<StripeEvent({self.stripe_event_id} {self.event_type})>"
