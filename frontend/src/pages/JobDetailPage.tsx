import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { Job, ProgressEvent } from "../types";
import StatusBadge from "../components/StatusBadge";
import ProgressBar from "../components/ProgressBar";
import { formatDistanceToNow, format } from "date-fns";

interface EventLog {
  event: string;
  stage?: string;
  pct?: number;
  message?: string;
  ts: string;
}

export default function JobDetailPage() {
  const { jobId } = useParams<{ jobId: string }>();
  const nav = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [events, setEvents] = useState<EventLog[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const sseCleanup = useRef<(() => void) | null>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);

  const fetchJob = useCallback(async () => {
    if (!jobId) return;
    try {
      const j = await api.getJob(jobId);
      setJob(j);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load job");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  // Start SSE when job is active
  useEffect(() => {
    if (!jobId || !job) return;
    if (job.status === "completed" || job.status === "failed" || job.status === "finalized") return;

    sseCleanup.current = api.streamProgress(
      jobId,
      (evt: ProgressEvent) => {
        setEvents((prev) => [...prev, {
          event: evt.event,
          stage: evt.stage,
          pct: evt.progress_pct,
          message: evt.message,
          ts: evt.timestamp ?? new Date().toISOString(),
        }]);
        // Update job inline
        setJob((prev) => prev ? {
          ...prev,
          status: (evt.event === "job_completed" ? "completed" : evt.event === "job_failed" ? "failed" : prev.status) as Job["status"],
          current_stage: evt.stage ?? prev.current_stage,
          progress_pct: evt.progress_pct ?? prev.progress_pct,
        } : prev);
        if (evt.event === "job_completed" || evt.event === "job_failed") {
          fetchJob();
        }
      },
      () => {
        fetchJob();
      }
    );
    return () => sseCleanup.current?.();
  }, [jobId, job?.status, fetchJob]);

  // Auto-scroll event log
  useEffect(() => {
    if (eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [events]);

  const startEdit = () => {
    const data = job?.reviewed_data ?? job?.extracted_data ?? {};
    setEditValue(JSON.stringify(data, null, 2));
    setEditMode(true);
    setEditError("");
  };

  const saveReview = async () => {
    if (!jobId) return;
    try {
      const parsed = JSON.parse(editValue);
      setSaving(true);
      const updated = await api.updateReview(jobId, parsed);
      setJob(updated);
      setEditMode(false);
      setEditError("");
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : "Invalid JSON");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!jobId) return;
    setFinalizing(true);
    try {
      const updated = await api.finalizeJob(jobId);
      setJob(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  };

  const handleRetry = async () => {
    if (!jobId) return;
    setRetrying(true);
    try {
      await api.retryJob(jobId);
      setEvents([]);
      await fetchJob();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const handleExportJson = async () => {
    if (!jobId) return;
    const data = await api.exportJson(jobId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `job_${jobId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = () => {
    if (!jobId) return;
    window.open(api.exportCsvUrl(jobId), "_blank");
  };

  if (loading) return (
    <div style={{ fontFamily: "var(--mono)", color: "var(--text-muted)", padding: "48px 0", textAlign: "center" }}>
      LOADING JOB...
    </div>
  );

  if (error) return (
    <div style={{ color: "var(--red)", fontFamily: "var(--mono)", padding: "24px", background: "rgba(255,77,77,0.08)", borderRadius: "4px", border: "1px solid var(--red-dim)" }}>
      ERROR: {error}
    </div>
  );

  if (!job) return null;

  const displayData = job.reviewed_data ?? job.extracted_data;
  const isActive = job.status === "queued" || job.status === "processing";
  const isFinalized = job.status === "finalized";
  const canEdit = job.status === "completed" || isFinalized;
  const canExport = isFinalized;

  return (
    <div>
      {/* Back */}
      <button
        onClick={() => nav("/dashboard")}
        style={{ background: "none", color: "var(--text-dim)", fontFamily: "var(--mono)", fontSize: "12px", marginBottom: "24px", padding: "0", letterSpacing: "0.04em" }}
      >
        ← BACK TO DASHBOARD
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "28px", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontFamily: "var(--mono)", fontSize: "18px", fontWeight: 600 }}>
              JOB DETAIL
            </h1>
            <StatusBadge status={job.status} />
          </div>
          <p style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-muted)" }}>
            {job.id}
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {job.status === "failed" && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              style={{
                background: "rgba(245,197,66,0.1)",
                color: "var(--yellow)",
                border: "1px solid var(--yellow-dim)",
                padding: "8px 18px",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                borderRadius: "var(--radius)",
              }}
            >
              {retrying ? "RETRYING..." : "↺ RETRY"}
            </button>
          )}
          {canEdit && !isFinalized && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              style={{
                background: "rgba(77,159,255,0.1)",
                color: "var(--blue)",
                border: "1px solid #2a5f9e",
                padding: "8px 18px",
                fontSize: "12px",
                fontWeight: 600,
                letterSpacing: "0.06em",
                borderRadius: "var(--radius)",
              }}
            >
              {finalizing ? "FINALIZING..." : "✓ FINALIZE"}
            </button>
          )}
          {canExport && (
            <>
              <button
                onClick={handleExportJson}
                style={{
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-dim)",
                  padding: "8px 18px",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  borderRadius: "var(--radius)",
                }}
              >
                ↓ JSON
              </button>
              <button
                onClick={handleExportCsv}
                style={{
                  background: "var(--accent-bg)",
                  color: "var(--accent)",
                  border: "1px solid var(--accent-dim)",
                  padding: "8px 18px",
                  fontSize: "12px",
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  borderRadius: "var(--radius)",
                }}
              >
                ↓ CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Meta card */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px", padding: "20px" }}>
            <h3 style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: "16px" }}>
              METADATA
            </h3>
            {[
              ["Document ID", job.document_id],
              ["Queued", format(new Date(job.queued_at), "MMM d, yyyy HH:mm:ss")],
              ["Started", job.started_at ? format(new Date(job.started_at), "HH:mm:ss") : "—"],
              ["Completed", job.completed_at ? format(new Date(job.completed_at), "HH:mm:ss") : "—"],
              ["Finalized", job.finalized_at ? format(new Date(job.finalized_at), "HH:mm:ss") : "—"],
              ["Retry count", String(job.retry_count)],
              ["Celery task", job.celery_task_id ?? "—"],
            ].map(([label, val]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", gap: "12px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-dim)", flexShrink: 0 }}>{label}</span>
                <span style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text)", textAlign: "right", wordBreak: "break-all" }}>{val}</span>
              </div>
            ))}
          </div>

          {/* Progress card */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px", padding: "20px" }}>
            <h3 style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: "16px" }}>
              PROGRESS
            </h3>
            <ProgressBar
              pct={job.progress_pct}
              failed={job.status === "failed"}
              stage={job.current_stage}
            />
            {job.error_message && (
              <div style={{ marginTop: "12px", padding: "10px 14px", background: "rgba(255,77,77,0.08)", border: "1px solid var(--red-dim)", borderRadius: "var(--radius)", fontFamily: "var(--mono)", fontSize: "12px", color: "var(--red)" }}>
                {job.error_message}
              </div>
            )}
          </div>

          {/* Event log */}
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px", padding: "20px" }}>
            <h3 style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)", marginBottom: "16px" }}>
              LIVE EVENT LOG {isActive && <span className="pulse-dot" style={{ display: "inline-block", marginLeft: "8px", background: "var(--yellow)" }} />}
            </h3>
            <div
              ref={eventLogRef}
              style={{ maxHeight: "200px", overflowY: "auto", fontFamily: "var(--mono)", fontSize: "11px" }}
            >
              {events.length === 0 && (
                <div style={{ color: "var(--text-muted)" }}>
                  {isActive ? "Waiting for events..." : "No live events captured in this session."}
                </div>
              )}
              {events.map((e, i) => (
                <div key={i} style={{ marginBottom: "6px", display: "flex", gap: "12px" }}>
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    {new Date(e.ts).toLocaleTimeString()}
                  </span>
                  <span style={{
                    color: e.event === "job_completed" ? "var(--accent)"
                      : e.event === "job_failed" ? "var(--red)"
                      : "var(--yellow)",
                  }}>
                    {e.event}
                  </span>
                  {e.pct !== undefined && <span style={{ color: "var(--text-dim)" }}>{e.pct}%</span>}
                  {e.message && <span style={{ color: "var(--text-dim)" }}>{e.message}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column - extracted data */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "4px", padding: "20px", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ fontFamily: "var(--mono)", fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", color: "var(--text-dim)" }}>
              {job.reviewed_data ? "REVIEWED DATA" : "EXTRACTED DATA"}
              {isFinalized && <span style={{ marginLeft: "8px", color: "var(--blue)" }}>[FINALIZED]</span>}
            </h3>
            {canEdit && !editMode && (
              <button
                onClick={startEdit}
                style={{
                  background: "none",
                  color: "var(--text-dim)",
                  border: "1px solid var(--border)",
                  padding: "5px 12px",
                  fontSize: "11px",
                  fontFamily: "var(--mono)",
                  letterSpacing: "0.06em",
                  borderRadius: "var(--radius)",
                }}
              >
                EDIT
              </button>
            )}
          </div>

          {!displayData && !isActive && (
            <div style={{ color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "12px" }}>
              No data available yet.
            </div>
          )}

          {!editMode && displayData && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {Object.entries(displayData).map(([key, val]) => (
                <div key={key} style={{ marginBottom: "14px" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "10px", fontWeight: 600, letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase" }}>
                    {key}
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "13px", color: "var(--text)", wordBreak: "break-word" }}>
                    {typeof val === "object" ? JSON.stringify(val) : String(val)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {editMode && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "12px" }}>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                style={{
                  flex: 1,
                  minHeight: "300px",
                  resize: "vertical",
                  fontFamily: "var(--mono)",
                  fontSize: "12px",
                  lineHeight: 1.6,
                  padding: "12px",
                  background: "var(--surface2)",
                  border: editError ? "1px solid var(--red)" : "1px solid var(--border)",
                  color: "var(--text)",
                  borderRadius: "var(--radius)",
                }}
              />
              {editError && (
                <div style={{ color: "var(--red)", fontFamily: "var(--mono)", fontSize: "12px" }}>
                  {editError}
                </div>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveReview}
                  disabled={saving}
                  style={{
                    background: "var(--accent)",
                    color: "#000",
                    padding: "8px 20px",
                    fontSize: "12px",
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    borderRadius: "var(--radius)",
                  }}
                >
                  {saving ? "SAVING..." : "SAVE REVIEW"}
                </button>
                <button
                  onClick={() => { setEditMode(false); setEditError(""); }}
                  style={{
                    background: "none",
                    color: "var(--text-dim)",
                    border: "1px solid var(--border)",
                    padding: "8px 16px",
                    fontSize: "12px",
                    letterSpacing: "0.06em",
                    borderRadius: "var(--radius)",
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
