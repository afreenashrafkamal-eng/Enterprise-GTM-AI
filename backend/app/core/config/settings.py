from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[4]


class Settings(BaseSettings):
    app_name: str = "Enterprise GTM AI"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    openai_api_key: str = ""
    openai_model: str = "gpt-6.2-sol"

    postgres_user: str = "postgres"
    postgres_password: str = ""
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "enterprise_gtm_ai"

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()