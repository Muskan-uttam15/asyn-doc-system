from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "docflow",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.workers.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_use_ssl={
        "ssl_cert_reqs": "required"
    } if settings.celery_broker_url.startswith("rediss://") else None,
    redis_backend_use_ssl={
        "ssl_cert_reqs": "required"
    } if settings.celery_result_backend.startswith("rediss://") else None,
    task_routes={
        "app.workers.tasks.process_document": {"queue": "documents"},
    },
)
