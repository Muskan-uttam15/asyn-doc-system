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

    class Config:
        env_file = ".env"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
