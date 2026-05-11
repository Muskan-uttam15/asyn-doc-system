from __future__ import annotations

import os
import time
import uuid
import random
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from app.workers.celery_app import celery_app
from app.core.config import settings
from app.core.redis_client import publish_progress
from app.models.document import ProcessingJob, Document, JobStatus


# ── Sync DB setup for Celery worker ──────────────────────────────────────────

_engine = None
_SessionLocal = None


def _fix_sync_url(url: str) -> str:
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql+asyncpg://"):
        return url.replace("postgresql+asyncpg://", "postgresql://", 1)
    return url


def get_sync_session() -> Session:
    global _engine, _SessionLocal
    if _engine is None:
        sync_url = _fix_sync_url(settings.database_url)
        _engine = create_engine(sync_url, pool_pre_ping=True)
        _SessionLocal = sessionmaker(bind=_engine)
    return _SessionLocal()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _emit(job_id: str, event: str, stage: str, pct: int, message: str = ""):
    publish_progress(job_id, event, {
        "stage": stage,
        "progress_pct": pct,
        "message": message,
        "timestamp": datetime.utcnow().isoformat(),
    })


def _update_job(session: Session, job: ProcessingJob, **kwargs):
    for k, v in kwargs.items():
        setattr(job, k, v)
    session.commit()


# ── Simulated parsing ─────────────────────────────────────────────────────────

def _parse_document(file_path: str, filename: str, mime_type: str | None) -> dict:
    size = os.path.getsize(file_path) if os.path.exists(file_path) else 0
    ext = os.path.splitext(filename)[-1].lower()

    raw_text = ""
    if ext in (".txt", ".md", ".csv", ".json", ".log"):
        try:
            with open(file_path, "r", errors="ignore") as f:
                raw_text = f.read(5000)
        except Exception:
            raw_text = ""

    return {
        "filename": filename,
        "extension": ext,
        "mime_type": mime_type or "application/octet-stream",
        "file_size_bytes": size,
        "raw_text_preview": raw_text[:500] if raw_text else None,
        "line_count": raw_text.count("\n") if raw_text else None,
        "char_count": len(raw_text) if raw_text else None,
    }


def _extract_fields(parsed: dict, raw_text: str = "") -> dict:
    filename = parsed["filename"]
    ext = parsed["extension"]
    size = parsed["file_size_bytes"]

    title = os.path.splitext(filename)[0].replace("_", " ").replace("-", " ").title()

    category_map = {
        ".pdf": "PDF Document",
        ".txt": "Plain Text",
        ".md": "Markdown",
        ".csv": "Tabular Data",
        ".json": "Structured Data",
        ".docx": "Word Document",
        ".xlsx": "Spreadsheet",
        ".png": "Image",
        ".jpg": "Image",
        ".jpeg": "Image",
    }
    category = category_map.get(ext, "Binary / Unknown")

    if parsed.get("raw_text_preview"):
        preview = parsed["raw_text_preview"]
        summary = preview[:200].strip() + ("..." if len(preview) > 200 else "")
    else:
        summary = f"Binary file of type {category} ({size} bytes). No text content extracted."

    stopwords = {"the", "a", "an", "of", "in", "on", "at", "to", "for"}
    tokens = [
        w.lower() for w in filename.replace("_", " ").replace("-", " ").split()
        if w.lower() not in stopwords and len(w) > 2
    ]

    return {
        "title": title,
        "category": category,
        "summary": summary,
        "keywords": tokens[:10],
        "language": "en",
        "page_count": None if ext not in (".pdf", ".docx") else random.randint(1, 20),
        "word_count": parsed.get("char_count", 0) // 6 if parsed.get("char_count") else None,
        "extraction_confidence": round(random.uniform(0.82, 0.99), 3),
        "processing_notes": [
            f"Processed at {datetime.utcnow().isoformat()}",
            f"File type: {category}",
        ],
        "metadata": {
            "file_size_bytes": size,
            "mime_type": parsed["mime_type"],
            "extension": ext,
        },
    }


# ── Main Celery task ──────────────────────────────────────────────────────────

@celery_app.task(
    bind=True,
    name="app.workers.tasks.process_document",
    max_retries=3,
    default_retry_delay=10,
    acks_late=True,
)
def process_document(self, job_id: str):
    session = get_sync_session()
    try:
        job: ProcessingJob = session.query(ProcessingJob).filter_by(id=uuid.UUID(job_id)).first()
        if not job:
            return

        doc: Document = session.query(Document).filter_by(id=job.document_id).first()
        if not doc:
            return

        _update_job(session, job,
                    status=JobStatus.PROCESSING,
                    celery_task_id=self.request.id,
                    started_at=datetime.utcnow(),
                    current_stage="job_started",
                    progress_pct=5)
        _emit(job_id, "job_started", "job_started", 5, "Job picked up by worker")
        time.sleep(0.5)

        _update_job(session, job, current_stage="parsing_started", progress_pct=15)
        _emit(job_id, "document_parsing_started", "parsing_started", 15, "Parsing document structure")
        time.sleep(1.0)

        parsed = _parse_document(doc.file_path, doc.original_filename, doc.mime_type)
        time.sleep(0.8)

        _update_job(session, job, current_stage="parsing_completed", progress_pct=40)
        _emit(job_id, "document_parsing_completed", "parsing_completed", 40, "Parsing complete")
        time.sleep(0.4)

        _update_job(session, job, current_stage="extraction_started", progress_pct=50)
        _emit(job_id, "field_extraction_started", "extraction_started", 50, "Extracting structured fields")
        time.sleep(1.2)

        raw_text = parsed.get("raw_text_preview") or ""
        extracted = _extract_fields(parsed, raw_text)
        time.sleep(0.8)

        _update_job(session, job, current_stage="extraction_completed", progress_pct=75)
        _emit(job_id, "field_extraction_completed", "extraction_completed", 75, "Field extraction complete")
        time.sleep(0.4)

        _update_job(session, job, current_stage="storing_result", progress_pct=90)
        _emit(job_id, "storing_result", "storing_result", 90, "Persisting extracted data")
        time.sleep(0.5)

        final_result = {**parsed, **extracted}
        _update_job(session, job,
                    extracted_data=final_result,
                    status=JobStatus.COMPLETED,
                    current_stage="job_completed",
                    progress_pct=100,
                    completed_at=datetime.utcnow())
        _emit(job_id, "job_completed", "job_completed", 100, "Processing complete")

    except Exception as exc:
        try:
            _update_job(session, job,
                        status=JobStatus.FAILED,
                        current_stage="job_failed",
                        error_message=str(exc))
            _emit(job_id, "job_failed", "job_failed", 0, str(exc))
        except Exception:
            pass

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise
    finally:
        session.close()


@celery_app.task(name="app.workers.tasks.retry_job")
def retry_job(job_id: str):
    session = get_sync_session()
    try:
        job: ProcessingJob = session.query(ProcessingJob).filter_by(id=uuid.UUID(job_id)).first()
        if not job:
            return
        job.status = JobStatus.QUEUED
        job.current_stage = "job_queued"
        job.progress_pct = 0
        job.error_message = None
        job.retry_count += 1
        job.started_at = None
        job.completed_at = None
        job.extracted_data = None
        job.reviewed_data = None
        session.commit()
        _emit(job_id, "job_queued", "job_queued", 0, "Job re-queued for retry")
        process_document.delay(job_id)
    finally:
        session.close()
