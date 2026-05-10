from __future__ import annotations
import asyncio
import json
from typing import Optional, AsyncGenerator

from fastapi import APIRouter, Depends, UploadFile, File, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.redis_client import get_async_redis, job_channel, get_job_status_from_redis
from app.schemas.document import (
    UploadResponse, DocumentOut, JobOut, JobListItem,
    PaginatedJobs, ReviewedDataUpdate,
)
from app.services import document_service as svc
from app.workers.tasks import process_document, retry_job

router = APIRouter(prefix="/api", tags=["documents"])


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_documents(
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    docs_out, jobs_out = [], []
    for file in files:
        doc, job = await svc.save_upload(file, db)
        docs_out.append(doc)
        jobs_out.append(job)
        # Dispatch Celery task after DB commit
        await db.flush()

    await db.commit()

    for job in jobs_out:
        process_document.delay(str(job.id))

    return UploadResponse(
        documents=[DocumentOut.model_validate(d) for d in docs_out],
        jobs=[JobOut.model_validate(j) for j in jobs_out],
    )


# ── List / search ─────────────────────────────────────────────────────────────

@router.get("/jobs", response_model=PaginatedJobs)
async def list_jobs(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    sort_by: str = Query("queued_at"),
    sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    total, items = await svc.get_jobs_list(db, status, search, sort_by, sort_dir, page, page_size)
    return PaginatedJobs(
        total=total,
        items=[JobListItem(**item) for item in items],
        page=page,
        page_size=page_size,
    )


# ── Detail ────────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}", response_model=JobOut)
async def get_job(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await svc.get_job_detail(job_id, db)
    return JobOut.model_validate(job)


# ── SSE progress stream ───────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/progress")
async def job_progress_stream(job_id: str):
    """
    Server-Sent Events endpoint.
    Subscribes to the Redis Pub/Sub channel for this job and
    streams events until job_completed / job_failed is received.
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        r = await get_async_redis()
        pubsub = r.pubsub()
        await pubsub.subscribe(job_channel(job_id))

        # Send current cached state first
        cached = await get_job_status_from_redis(job_id)
        if cached:
            yield f"data: {json.dumps(cached)}\n\n"

        terminal_events = {"job_completed", "job_failed"}
        timeout_seconds = 300  # 5-min safety timeout

        async def _listen():
            async for msg in pubsub.listen():
                if msg["type"] == "message":
                    data = msg["data"]
                    yield f"data: {data}\n\n"
                    try:
                        parsed = json.loads(data)
                        if parsed.get("event") in terminal_events:
                            return
                    except Exception:
                        pass

        try:
            async for chunk in _listen():
                yield chunk
        finally:
            await pubsub.unsubscribe(job_channel(job_id))
            await pubsub.close()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Polling fallback ──────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/status")
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """Polling-friendly status endpoint (no SSE)."""
    cached = await get_job_status_from_redis(job_id)
    if cached:
        return cached
    job = await svc.get_job_detail(job_id, db)
    return {
        "event": job.current_stage or job.status,
        "job_id": job_id,
        "stage": job.current_stage,
        "progress_pct": job.progress_pct,
        "status": job.status,
    }


# ── Review & finalize ─────────────────────────────────────────────────────────

@router.put("/jobs/{job_id}/review", response_model=JobOut)
async def update_review(
    job_id: str,
    update: ReviewedDataUpdate,
    db: AsyncSession = Depends(get_db),
):
    job = await svc.update_reviewed_data(job_id, update, db)
    await db.commit()
    return JobOut.model_validate(job)


@router.post("/jobs/{job_id}/finalize", response_model=JobOut)
async def finalize(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await svc.finalize_job(job_id, db)
    await db.commit()
    return JobOut.model_validate(job)


# ── Retry ─────────────────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/retry", response_model=JobOut)
async def retry(job_id: str, db: AsyncSession = Depends(get_db)):
    job = await svc.get_job_detail(job_id, db)
    retry_job.delay(job_id)
    return JobOut.model_validate(job)


# ── Export ────────────────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}/export/json")
async def export_json(job_id: str, db: AsyncSession = Depends(get_db)):
    data = await svc.export_job_json(job_id, db)
    return data


@router.get("/jobs/{job_id}/export/csv")
async def export_csv(job_id: str, db: AsyncSession = Depends(get_db)):
    csv_str = await svc.export_job_csv(job_id, db)
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=job_{job_id}.csv"},
    )
