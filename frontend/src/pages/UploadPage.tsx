import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import type { Job } from "../types";
import ProgressBar from "../components/ProgressBar";

interface UploadItem {
  file: File;
  job?: Job;
  error?: string;
  uploading: boolean;
}

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function UploadPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const nav = useNavigate();

  const onDrop = useCallback((accepted: File[]) => {
    setItems((prev) => [
      ...prev,
      ...accepted.map((f) => ({ file: f, uploading: false })),
    ]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    maxSize: 50 * 1024 * 1024,
  });

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleUpload = async () => {
    if (!items.length) return;
    setUploading(true);
    const pending = items.filter((i) => !i.job);
    if (!pending.length) { setUploading(false); return; }
    try {
      const res = await api.uploadDocuments(pending.map((i) => i.file));
      setItems((prev) =>
        prev.map((item) => {
          const idx = pending.findIndex((p) => p.file === item.file);
          if (idx === -1) return item;
          return { ...item, job: res.jobs[idx], uploading: false };
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setItems((prev) => prev.map((i) => ({ ...i, error: msg })));
    } finally {
      setUploading(false);
    }
  };

  const allDone = items.length > 0 && items.every((i) => i.job);

  return (
    <div>
      <div style={{ marginBottom: "32px" }}>
        <h1 style={{ fontFamily: "var(--mono)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text)" }}>
          UPLOAD DOCUMENTS
        </h1>
        <p style={{ color: "var(--text-dim)", marginTop: "6px", fontSize: "13px" }}>
          Drag and drop files to enqueue them for async processing.
        </p>
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? "var(--accent)" : "var(--border-bright)"}`,
          borderRadius: "4px",
          padding: "64px 40px",
          textAlign: "center",
          background: isDragActive ? "var(--accent-bg)" : "var(--surface)",
          cursor: "pointer",
          transition: "all 0.2s",
          marginBottom: "24px",
        }}
      >
        <input {...getInputProps()} />
        <div style={{ fontFamily: "var(--mono)", fontSize: "32px", marginBottom: "12px", color: isDragActive ? "var(--accent)" : "var(--text-muted)" }}>
          ⊕
        </div>
        <p style={{ fontFamily: "var(--mono)", fontSize: "13px", color: isDragActive ? "var(--accent)" : "var(--text-dim)" }}>
          {isDragActive ? "DROP FILES HERE" : "DRAG FILES HERE  ·  OR CLICK TO BROWSE"}
        </p>
        <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px" }}>
          Max 50 MB per file. Any file type accepted.
        </p>
      </div>

      {/* File list */}
      {items.length > 0 && (
        <div style={{ marginBottom: "24px" }}>
          <div style={{ borderRadius: "4px", border: "1px solid var(--border)", overflow: "hidden" }}>
            {items.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  padding: "14px 16px",
                  borderBottom: idx < items.length - 1 ? "1px solid var(--border)" : "none",
                  background: "var(--surface)",
                }}
              >
                <span style={{ fontFamily: "var(--mono)", fontSize: "18px", color: "var(--text-muted)" }}>◻</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "13px", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.file.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-dim)", marginTop: "2px" }}>
                    {fmt(item.file.size)} · {item.file.type || "unknown"}
                  </div>
                  {item.error && (
                    <div style={{ fontSize: "12px", color: "var(--red)", marginTop: "4px" }}>{item.error}</div>
                  )}
                  {item.job && (
                    <div style={{ marginTop: "8px" }}>
                      <ProgressBar pct={0} stage="job_queued" />
                      <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--accent)" }}>
                        Job queued →{" "}
                        <span
                          style={{ cursor: "pointer", textDecoration: "underline" }}
                          onClick={() => nav(`/jobs/${item.job!.id}`)}
                        >
                          View progress
                        </span>
                      </div>
                    </div>
                  )}
                </div>
                {!item.job && (
                  <button
                    onClick={() => removeItem(idx)}
                    style={{
                      background: "none",
                      color: "var(--text-muted)",
                      fontSize: "16px",
                      padding: "4px 8px",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                )}
                {item.job && (
                  <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--accent)" }}>✓ QUEUED</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px" }}>
        {!allDone && (
          <button
            onClick={handleUpload}
            disabled={uploading || items.length === 0}
            style={{
              background: uploading || !items.length ? "var(--surface2)" : "var(--accent)",
              color: uploading || !items.length ? "var(--text-muted)" : "#000",
              padding: "10px 28px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              borderRadius: "var(--radius)",
              transition: "all 0.15s",
              border: "1px solid transparent",
            }}
          >
            {uploading ? "UPLOADING..." : `UPLOAD ${items.filter((i) => !i.job).length} FILE${items.filter((i) => !i.job).length !== 1 ? "S" : ""}`}
          </button>
        )}
        {allDone && (
          <button
            onClick={() => nav("/dashboard")}
            style={{
              background: "var(--accent-bg)",
              color: "var(--accent)",
              border: "1px solid var(--accent-dim)",
              padding: "10px 28px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              borderRadius: "var(--radius)",
            }}
          >
            → VIEW DASHBOARD
          </button>
        )}
        {items.length > 0 && (
          <button
            onClick={() => setItems([])}
            style={{
              background: "none",
              color: "var(--text-dim)",
              border: "1px solid var(--border)",
              padding: "10px 20px",
              fontSize: "12px",
              letterSpacing: "0.06em",
              borderRadius: "var(--radius)",
            }}
          >
            CLEAR ALL
          </button>
        )}
      </div>
    </div>
  );
}
