import json
import ssl
import redis.asyncio as aioredis
import redis as sync_redis
from app.core.config import settings

_async_pool: aioredis.Redis | None = None
_sync_client: sync_redis.Redis | None = None


def _is_tls(url: str) -> bool:
    return url.startswith("rediss://")


def get_sync_redis() -> sync_redis.Redis:
    global _sync_client
    if _sync_client is None:
        if _is_tls(settings.redis_url):
            _sync_client = sync_redis.from_url(
                settings.redis_url,
                decode_responses=True,
                ssl_cert_reqs="required",
            )
        else:
            _sync_client = sync_redis.from_url(
                settings.redis_url,
                decode_responses=True,
            )
    return _sync_client


async def get_async_redis() -> aioredis.Redis:
    global _async_pool
    if _async_pool is None:
        if _is_tls(settings.redis_url):
            _async_pool = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
                ssl_cert_reqs=ssl.CERT_REQUIRED,
            )
        else:
            _async_pool = aioredis.from_url(
                settings.redis_url,
                decode_responses=True,
            )
    return _async_pool


def job_channel(job_id: str) -> str:
    return f"job_progress:{job_id}"


def publish_progress(job_id: str, event: str, data: dict):
    r = get_sync_redis()
    payload = json.dumps({"event": event, "job_id": job_id, **data})
    r.publish(job_channel(job_id), payload)
    r.hset(f"job_status:{job_id}", mapping={"event": event, **{k: str(v) for k, v in data.items()}})
    r.expire(f"job_status:{job_id}", 3600)


async def get_job_status_from_redis(job_id: str) -> dict | None:
    r = await get_async_redis()
    data = await r.hgetall(f"job_status:{job_id}")
    return data if data else None
