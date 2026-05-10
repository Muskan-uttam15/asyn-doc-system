import type {
  Job,
  JobListItem,
  PaginatedJobs,
  UploadResponse,
  ProgressEvent,
} from "../types";

const baseUrl = import.meta.env.VITE_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  uploadDocuments: (files: File[]): Promise<UploadResponse> => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return request<UploadResponse>("/api/upload", { method: "POST", body: form });
  },

  listJobs: (params: {
    status?: string;
    search?: string;
    sort_by?: string;
    sort_dir?: string;
    page?: number;
    page_size?: number;
  }): Promise<PaginatedJobs> => {
    const qs = new URLSearchParams();
    if (params.status) qs.set("status", params.status);
    if (params.search) qs.set("search", params.search);
    if (params.sort_by) qs.set("sort_by", params.sort_by);
    if (params.sort_dir) qs.set("sort_dir", params.sort_dir);
    if (params.page) qs.set("page", String(params.page));
    if (params.page_size) qs.set("page_size", String(params.page_size));
    return request<PaginatedJobs>(`/api/jobs?${qs}`);
  },

  getJob: (jobId: string): Promise<Job> =>
    request<Job>(`/api/jobs/${jobId}`),

  updateReview: (jobId: string, reviewed_data: Record<string, unknown>): Promise<Job> =>
    request<Job>(`/api/jobs/${jobId}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewed_data }),
    }),

  finalizeJob: (jobId: string): Promise<Job> =>
    request<Job>(`/api/jobs/${jobId}/finalize`, { method: "POST" }),

  retryJob: (jobId: string): Promise<Job> =>
    request<Job>(`/api/jobs/${jobId}/retry`, { method: "POST" }),

  exportJson: (jobId: string): Promise<unknown> =>
    request<unknown>(`/api/jobs/${jobId}/export/json`),

  exportCsvUrl: (jobId: string): string =>
    `${baseUrl}/api/jobs/${jobId}/export/csv`,

  // SSE-based progress streaming
  streamProgress: (
    jobId: string,
    onEvent: (evt: ProgressEvent) => void,
    onDone: () => void
  ): (() => void) => {
    const es = new EventSource(`${baseUrl}/api/jobs/${jobId}/progress`);
    es.onmessage = (e) => {
      try {
        const data: ProgressEvent = JSON.parse(e.data);
        onEvent(data);
        if (data.event === "job_completed" || data.event === "job_failed") {
          es.close();
          onDone();
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es.close();
      onDone();
    };
    return () => es.close();
  },
};
