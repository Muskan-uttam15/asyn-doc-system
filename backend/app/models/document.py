import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, DateTime, Integer, Text, JSON, ForeignKey, Enum as SAEnum
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.core.database import Base


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    FINALIZED = "finalized"


class ProcessingStage(str, enum.Enum):
    RECEIVED = "document_received"
    PARSING_STARTED = "parsing_started"
    PARSING_COMPLETED = "parsing_completed"
    EXTRACTION_STARTED = "extraction_started"
    EXTRACTION_COMPLETED = "extraction_completed"
    STORING_RESULT = "storing_result"
    COMPLETED = "job_completed"
    FAILED = "job_failed"


class Document(Base):
    __tablename__ = "documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job = relationship("ProcessingJob", back_populates="document", uselist=False, cascade="all, delete-orphan")


class ProcessingJob(Base):
    __tablename__ = "processing_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id = Column(UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    celery_task_id = Column(String(255), nullable=True)

    status = Column(SAEnum(JobStatus), default=JobStatus.QUEUED, nullable=False)
    current_stage = Column(String(100), nullable=True)
    progress_pct = Column(Integer, default=0)

    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)

    # Raw extraction results
    extracted_data = Column(JSON, nullable=True)
    # Reviewed/edited version
    reviewed_data = Column(JSON, nullable=True)

    queued_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    finalized_at = Column(DateTime, nullable=True)

    document = relationship("Document", back_populates="job")
