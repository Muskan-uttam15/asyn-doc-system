from __future__ import annotations
import uuid
import os
import shutil
import csv
import json
import io
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc, asc
from fastapi import UploadFile, HTTPException

from app.models.document import Document, ProcessingJob, JobStatus
from app.schemas.document import ReviewedDataUpdate
from app.core.config import settings


async def save_upload(file: UploadFile, db: AsyncSession) -> tuple[Document, ProcessingJob]:
    """Persist file to disk and create DB records."""
    os.makedirs(settings.upload_dir, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[-1]
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(settings.upload_dir, stored_name)

    size = 0
    with open(file_path, "wb") as f:
        while chunk := await file.read(1024 * 64):
            size += len(chunk)
            if size > settings.max_upload_size_mb * 1024 * 1024:
                f.close()
                os.remove(file_path)
                raise HTTPException(413, f"File exceeds {settings.max_upload_size_mb}MB limit")
            f.write(chunk)

    doc = Document(
        filename=stored_name,
        original_filename=file.filename or stored_name,
        file_path=file_path,
        file_size=size,
        mime_type=file.content_type,
    )
    db.add(doc)
    await db.flush()  # get doc.id

    job = ProcessingJob(document_id=doc.id)
    db.add(job)
    await db.flush()

    return doc, job


async def get_jobs_list(
    db: AsyncSession,
    status: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: str = "queued_at",
    sort_dir: str = "desc",
    page: int = 1,
    page_size: int = 20,
):
    stmt = (
        select(
            ProcessingJob,
            Document.original_filename,
        )
        .join(Document, ProcessingJob.document_id == Document.id)
    )

    if status:
        stmt = stmt.where(ProcessingJob.status == status)
    if search:
        stmt = stmt.where(
            or_(
                Document.original_filename.ilike(f"%{search}%"),
            )
        )

    # Count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar_one()

    # Sort
    sort_col = {
        "queued_at": ProcessingJob.queued_at,
        "completed_at": ProcessingJob.completed_at,
        "status": ProcessingJob.status,
        "filename": Document.original_filename,
    }.get(sort_by, ProcessingJob.queued_at)

    stmt = stmt.order_by(desc(sort_col) if sort_dir == "desc" else asc(sort_col))
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    rows = (await db.execute(stmt)).all()

    items = []
    for row in rows:
        job_obj, orig_fn = row
        item = {
            "id": job_obj.id,
            "document_id": job_obj.document_id,
            "status": job_obj.status,
            "current_stage": job_obj.current_stage,
            "progress_pct": job_obj.progress_pct,
            "retry_count": job_obj.retry_count,
            "queued_at": job_obj.queued_at,
            "completed_at": job_obj.completed_at,
            "original_filename": orig_fn,
        }
        items.append(item)

    return total, items


async def get_job_detail(job_id: str, db: AsyncSession) -> ProcessingJob:
    stmt = select(ProcessingJob).where(ProcessingJob.id == uuid.UUID(job_id))
    result = await db.execute(stmt)
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(404, "Job not found")
    return job


async def get_document(doc_id: str, db: AsyncSession) -> Document:
    stmt = select(Document).where(Document.id == uuid.UUID(doc_id))
    result = await db.execute(stmt)
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


async def update_reviewed_data(job_id: str, update: ReviewedDataUpdate, db: AsyncSession) -> ProcessingJob:
    job = await get_job_detail(job_id, db)
    if job.status not in (JobStatus.COMPLETED, JobStatus.FINALIZED):
        raise HTTPException(400, "Can only review completed jobs")
    job.reviewed_data = update.reviewed_data
    await db.flush()
    return job


async def finalize_job(job_id: str, db: AsyncSession) -> ProcessingJob:
    job = await get_job_detail(job_id, db)
    if job.status not in (JobStatus.COMPLETED, JobStatus.FINALIZED):
        raise HTTPException(400, "Job must be completed before finalizing")
    if not job.reviewed_data and not job.extracted_data:
        raise HTTPException(400, "No data to finalize")
    job.status = JobStatus.FINALIZED
    job.finalized_at = datetime.utcnow()
    if not job.reviewed_data:
        job.reviewed_data = job.extracted_data
    await db.flush()
    return job


async def export_job_json(job_id: str, db: AsyncSession) -> dict:
    job = await get_job_detail(job_id, db)
    doc = await get_document(str(job.document_id), db)
    if job.status != JobStatus.FINALIZED:
        raise HTTPException(400, "Only finalized jobs can be exported")
    return {
        "job_id": str(job.id),
        "document": {
            "id": str(doc.id),
            "original_filename": doc.original_filename,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "created_at": doc.created_at.isoformat(),
        },
        "result": job.reviewed_data or job.extracted_data,
        "finalized_at": job.finalized_at.isoformat() if job.finalized_at else None,
    }


async def export_job_csv(job_id: str, db: AsyncSession) -> str:
    job = await get_job_detail(job_id, db)
    doc = await get_document(str(job.document_id), db)
    if job.status != JobStatus.FINALIZED:
        raise HTTPException(400, "Only finalized jobs can be exported")

    data = job.reviewed_data or job.extracted_data or {}
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["field", "value"])
    writer.writerow(["job_id", str(job.id)])
    writer.writerow(["filename", doc.original_filename])
    writer.writerow(["finalized_at", job.finalized_at.isoformat() if job.finalized_at else ""])
    for k, v in data.items():
        writer.writerow([k, json.dumps(v) if isinstance(v, (list, dict)) else v])
    return output.getvalue()
