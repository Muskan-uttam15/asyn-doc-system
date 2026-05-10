import type { JobStatus } from "../types";

const LABELS: Record<JobStatus, string> = {
  queued: "QUEUED",
  processing: "PROCESSING",
  completed: "COMPLETED",
  failed: "FAILED",
  finalized: "FINALIZED",
};

export default function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      {status === "processing" && <span className="pulse-dot" />}
      {LABELS[status]}
    </span>
  );
}
