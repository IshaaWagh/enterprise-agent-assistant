from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import URL

# .../enterprise-agent-assistant/backend/app/core/config.py -> project root
ROOT_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings, loaded from environment variables / the root .env file."""

    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",  # .env will gain more variables in later phases
    )

    app_env: str = "development"

    # PostgreSQL
    postgres_user: str
    postgres_password: str
    postgres_db: str
    postgres_host: str = "localhost"
    postgres_port: int = 5433

    # Chroma
    chroma_host: str = "localhost"
    chroma_port: int = 8001

    # GitHub (optional so the app still boots without them; ingestion requires them)
    github_token: SecretStr | None = None
    github_repo: str | None = None

    # Jira Cloud
    jira_base_url: str | None = None
    jira_email: str | None = None
    jira_api_token: SecretStr | None = None
    jira_project_key: str | None = None

    @property
    def database_url(self) -> URL:
        # URL.create safely escapes special characters in the password.
        return URL.create(
            drivername="postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


@lru_cache
def get_settings() -> Settings:
    """Create the settings object once and reuse it."""
    return Settings()