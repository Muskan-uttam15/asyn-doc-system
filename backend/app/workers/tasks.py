def _fix_sync_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


def get_sync_session() -> Session:
    global _engine, _SessionLocal
    if _engine is None:
        sync_url = _fix_sync_url(settings.sync_database_url or settings.database_url)
        _engine = create_engine(sync_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine)
    return _SessionLocal()
