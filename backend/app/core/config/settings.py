from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    app_name: str = "Enterprise GTM AI"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = False

    openai_api_key: str = ""
    openai_model: str = "gpt-6.2-sol"

    google_client_id: str = ""
    google_client_secret: str = ""
    google_auth_required: bool = False
    session_secret: str = ""
    gmail_token_encryption_key: str = ""
    database_url: str = ""
    outbound_email_provider: str = "gmail"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_use_ssl: bool = False
    smtp_starttls: bool = True
    exotel_api_base_url: str = "https://api.in.exotel.com"
    exotel_public_ws_base: str = ""
    phone_public_ws_base: str = ""
    frontend_url: str = "http://127.0.0.1:5176"
    additional_cors_origins: str = ""
    google_redirect_uri: str = "http://127.0.0.1:8000/auth/google/callback"

    postgres_user: str = "postgres"
    postgres_password: str = Field(
        default="",
        validation_alias="APP_POSTGRES_PASSWORD",
    )
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "enterprise_gtm_ai"

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def oauth_redirect_uri(self) -> str:
        """Derive the callback from the public URL when a host supplies only its base URL."""
        configured = self.google_redirect_uri.strip()
        if configured.endswith("/auth/google/callback"):
            return configured
        if configured:
            return f"{configured.rstrip('/')}/auth/google/callback"
        if self.environment == "production":
            return f"{self.frontend_url.rstrip('/')}/auth/google/callback"
        return "http://127.0.0.1:8000/auth/google/callback"


settings = Settings()
