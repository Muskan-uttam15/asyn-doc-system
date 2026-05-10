export type JobStatus = "queued" | "processing" | "completed" | "failed" | "finalized";

export interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string | null;
  created_at: string;
  updated_at: string | null;
  job?: Job;
}

export interface Job {
  id: string;
  document_id: string;
  celery_task_id: string | null;
  status: JobStatus;
  current_stage: string | null;
  progress_pct: number;
  error_message: string | null;
  retry_count: number;
  extracted_data: Record<string, unknown> | null;
  reviewed_data: Record<string, unknown> | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
  finalized_at: string | null;
}

export interface JobListItem {
  id: string;
  document_id: string;
  status: JobStatus;
  current_stage: string | null;
  progress_pct: number;
  retry_count: number;
  queued_at: string;
  completed_at: string | null;
  original_filename: string;
}

export interface PaginatedJobs {
  total: number;
  items: JobListItem[];
  page: number;
  page_size: number;
}

export interface ProgressEvent {
  event: string;
  job_id: string;
  stage?: string;
  progress_pct?: number;
  message?: string;
  error?: string;
  timestamp?: string;
}

export interface UploadResponse {
  documents: Document[];
  jobs: Job[];
}
