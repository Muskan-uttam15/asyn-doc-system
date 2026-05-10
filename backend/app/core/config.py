from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://docflow:docflow_secret@localhost:5432/docflow"
    sync_database_url: str = "postgresql://docflow:docflow_secret@localhost:5432/docflow"
    redis_url: str = "redis://localhost:6379/0"
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"
    upload_dir: str = "./uploads"
    max_upload_size_mb: int = 50
    secret_key: str = "super-secret-key-change-in-production"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # Render gives postgres:// — fix it for asyncpg
        if self.database_url.startswith("postgres://"):
            object.__setattr__(
                self,
                "database_url",
                self.database_url.replace("postgres://", "postgresql+asyncpg://", 1)
            )
        # Also fix sync URL
        if self.database_url.startswith("postgresql+asyncpg://"):
            object.__setattr__(
                self,
                "sync_database_url",
                self.database_url.replace("postgresql+asyncpg://", "postgresql://", 1)
            )

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
