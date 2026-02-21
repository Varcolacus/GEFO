from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    database_url: str = "postgresql://gefo_user:gefo_password@localhost:5432/gefo_db"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"
    un_comtrade_api_key: str = ""
    world_bank_base_url: str = "https://api.worldbank.org/v2"

    # AIS vessel tracking (AISstream.io — free, register at https://aisstream.io)
    aisstream_api_key: str = ""

    # Auth
    jwt_secret_key: str = "CHANGE-ME-in-production-use-openssl-rand-hex-32"
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
    def cors_origins_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"


settings = Settings()
