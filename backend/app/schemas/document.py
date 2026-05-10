from __future__ import annotations
from uuid import UUID
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict
from app.models.document import JobStatus


# ── Document schemas ────────────────────────────────────────────────────────

class DocumentBase(BaseModel):
    original_filename: str
    file_size: int
    mime_type: Optional[str] = None


class DocumentOut(DocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    filename: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    job: Optional[JobOut] = None


# ── Job schemas ──────────────────────────────────────────────────────────────

class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    celery_task_id: Optional[str] = None
    status: JobStatus
    current_stage: Optional[str] = None
    progress_pct: int
    error_message: Optional[str] = None
    retry_count: int
    extracted_data: Optional[dict[str, Any]] = None
    reviewed_data: Optional[dict[str, Any]] = None
    queued_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    finalized_at: Optional[datetime] = None


class JobListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    document_id: UUID
    status: JobStatus
    current_stage: Optional[str] = None
    progress_pct: int
    retry_count: int
    queued_at: datetime
    completed_at: Optional[datetime] = None
    original_filename: str  # joined from document


class ReviewedDataUpdate(BaseModel):
    reviewed_data: dict[str, Any]


class FinalizeRequest(BaseModel):
    pass


# ── Upload response ──────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    documents: list[DocumentOut]
    jobs: list[JobOut]


# ── Progress event ───────────────────────────────────────────────────────────

class ProgressEvent(BaseModel):
    event: str
    job_id: str
    stage: Optional[str] = None
    progress_pct: Optional[int] = None
    message: Optional[str] = None
    error: Optional[str] = None


# ── List response ────────────────────────────────────────────────────────────

class PaginatedJobs(BaseModel):
    total: int
    items: list[JobListItem]
    page: int
    page_size: int
