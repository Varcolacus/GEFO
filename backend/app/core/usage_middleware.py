"""
Usage tracking middleware — logs authenticated API requests for admin analytics.
"""

import time
import logging
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("gefo.usage")


class UsageTrackingMiddleware(BaseHTTPMiddleware):
    """Log API requests for usage analytics. Only tracks /api/ endpoints."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Only track API endpoints
        path = request.url.path
        if not path.startswith("/api/"):
            return await call_next(request)

        # Skip health/docs endpoints
        if path in ("/api/docs", "/api/redoc", "/api/openapi.json"):
            return await call_next(request)

        start = time.time()
        response = await call_next(request)
        elapsed_ms = (time.time() - start) * 1000

        # Try to log asynchronously (non-blocking)
        try:
            user_id = None
            if hasattr(request.state, "user") and request.state.user:
                user_id = request.state.user.id

            # Import here to avoid circular imports
            from app.core.database import SessionLocal
            from app.models.usage_log import APIUsageLog

            db = SessionLocal()
            try:
                log = APIUsageLog(
                    user_id=user_id,
                    endpoint=path,
                    method=request.method,
                    status_code=response.status_code,
                    response_time_ms=round(elapsed_ms, 2),
                    ip_address=request.client.host if request.client else None,
                    user_agent=request.headers.get("user-agent", "")[:500],
                )
                db.add(log)
                db.commit()
            finally:
                db.close()
        except Exception as exc:
            logger.debug("Usage logging failed: %s", exc)

        return response
