"""Rate limiting middleware — per-user, tier-aware."""

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from fastapi import Request, FastAPI
from fastapi.responses import JSONResponse


def _key_func(request: Request) -> str:
    """Rate limit key: use user ID from auth state, fallback to IP."""
    # The user may be attached by auth middleware before rate limiting
    user = getattr(request.state, "user", None)
    if user:
        return f"user:{user.id}"
    return get_remote_address(request)


limiter = Limiter(key_func=_key_func)


def setup_rate_limiting(app: FastAPI):
    """Attach SlowAPI rate limiting to the FastAPI app."""
    app.state.limiter = limiter

    @app.exception_handler(RateLimitExceeded)
    async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={
                "detail": "Rate limit exceeded",
                "retry_after": str(exc.detail),
            },
        )

    app.add_middleware(SlowAPIMiddleware)
