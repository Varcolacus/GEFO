"""
Sentry initialisation — env-gated, no-op when SENTRY_DSN is empty.

Called once from app/main.py before FastAPI starts. Importing sentry_sdk
unconditionally is fine — it's pure Python and lightweight; what matters
is whether `init()` is called.
"""
import logging
from typing import Optional

logger = logging.getLogger("gefo.sentry")


def init_sentry(
    dsn: str,
    environment: str,
    traces_sample_rate: float = 0.1,
    profiles_sample_rate: float = 0.0,
    release: Optional[str] = None,
) -> bool:
    """Initialise Sentry if a DSN is provided.

    Returns True if Sentry was initialised, False if skipped (no DSN).
    Failures inside sentry-sdk are caught and logged — Sentry must never
    prevent the API from starting.
    """
    if not dsn:
        logger.info("Sentry DSN not set — error reporting disabled")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.sqlalchemy import SqlalchemyIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            traces_sample_rate=traces_sample_rate,
            profiles_sample_rate=profiles_sample_rate,
            release=release,
            integrations=[
                FastApiIntegration(),
                SqlalchemyIntegration(),
            ],
            # PII is on by default in 2.x; explicit so it's reviewable.
            send_default_pii=False,
        )
        logger.info(
            "Sentry initialised (env=%s, traces=%.0f%%)",
            environment,
            traces_sample_rate * 100,
        )
        return True
    except ImportError:
        logger.warning(
            "sentry-sdk not installed — set SENTRY_DSN='' or `pip install sentry-sdk[fastapi]`"
        )
        return False
    except Exception as e:
        # Never let Sentry init crash the app.
        logger.exception("Sentry init failed (continuing without it): %s", e)
        return False
