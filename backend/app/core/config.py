from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import List


# Default placeholder value; refusing to boot in production with this set
# is what makes the rest of the auth surface meaningful.
DEFAULT_JWT_SECRET = "CHANGE-ME-in-production-use-openssl-rand-hex-32"


class Settings(BaseSettings):
    # ── Environment ──
    # "development" (default) | "staging" | "production". Production triggers
    # the security validators below.
    env: str = "development"

    database_url: str = "postgresql://gefo_user:gefo_password@localhost:5432/gefo_db"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    un_comtrade_api_key: str = ""
    world_bank_base_url: str = "https://api.worldbank.org/v2"

    # AIS vessel tracking (AISstream.io — free, register at https://aisstream.io)
    aisstream_api_key: str = ""

    # AISHUB (community AIS network — sign up at https://www.aishub.net)
    # Complements AISstream with better Asian coverage; deduplicates by MMSI.
    aishub_username: str = ""

    # Auth
    jwt_secret_key: str = DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 1440  # 24 hours

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_pro_price_id: str = ""
    stripe_institutional_price_id: str = ""

    # SMTP for email notifications (optional)
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "alerts@gefo.io"
    smtp_use_tls: bool = True

    # App URL (for links in emails)
    app_url: str = "http://localhost:3000"

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @model_validator(mode="after")
    def _enforce_production_security(self) -> "Settings":
        """Refuse to boot in production with insecure defaults.
        Caught at module load — fails fast, before FastAPI even starts."""
        if not self.is_production:
            return self

        problems: list[str] = []
        if not self.jwt_secret_key or self.jwt_secret_key == DEFAULT_JWT_SECRET:
            problems.append(
                "JWT_SECRET_KEY is empty or still the default placeholder. "
                "Generate one with: openssl rand -hex 32"
            )
        # Stripe webhook secret is loaded lazily by the billing module, but if
        # the user has set STRIPE_SECRET_KEY they almost certainly also need
        # the webhook secret — guard against the half-configured case.
        if self.stripe_secret_key and not self.stripe_webhook_secret:
            problems.append(
                "STRIPE_SECRET_KEY is set but STRIPE_WEBHOOK_SECRET is empty. "
                "Webhook signature verification will fail in production."
            )
        if problems:
            raise ValueError(
                "Refusing to start in ENV=production:\n  - "
                + "\n  - ".join(problems)
            )
        return self

    class Config:
        env_file = ".env"


settings = Settings()
