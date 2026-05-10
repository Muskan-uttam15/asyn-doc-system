import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { useStore } from "../store";
import StatusBadge from "../components/StatusBadge";
import ProgressBar from "../components/ProgressBar";
import type { JobStatus } from "../types";
import { formatDistanceToNow } from "date-fns";

const STATUS_OPTIONS = ["", "queued", "processing", "completed", "failed", "finalized"];

function fmt(bytes: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function DashboardPage() {
  const nav = useNavigate();
  const {
    jobs, total, page, pageSize, statusFilter, search, sortBy, sortDir,
    setJobs, setPage, setStatusFilter, setSearch, setSort,
  } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.listJobs({
        status: statusFilter || undefined,
        search: search || undefined,
        sort_by: sortBy,
        sort_dir: sortDir,
        page,
        page_size: pageSize,
      });
      setJobs(res.items, res.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, sortBy, sortDir, page, pageSize, setJobs]);

  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [load]);

  const totalPages = Math.ceil(total / pageSize);

  const handleSort = (col: string) => {
    if (sortBy === col) setSort(col, sortDir === "desc" ? "asc" : "desc");
    else setSort(col, "desc");
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <span style={{ color: "var(--text-muted)" }}>↕</span>;
    return <span style={{ color: "var(--accent)" }}>{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--mono)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em" }}>
            JOBS DASHBOARD
          </h1>
          <p style={{ color: "var(--text-dim)", fontSize: "13px", marginTop: "4px" }}>
            {total} total jobs · auto-refreshes every 3s
          </p>
        </div>
        <button
          onClick={() => nav("/upload")}
          style={{
            background: "var(--accent)",
            color: "#000",
            padding: "9px 22px",
            fontSize: "12px",
            fontWeight: 700,
            letterSpacing: "0.08em",
            borderRadius: "var(--radius)",
          }}
        >
          + UPLOAD
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <input
          placeholder="Search filename..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 200px", minWidth: "180px" }}
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ minWidth: "140px" }}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s ? s.toUpperCase() : "ALL STATUSES"}</option>
          ))}
        </select>
        <button
          onClick={load}
          style={{
            background: "var(--surface2)",
            color: "var(--text-dim)",
            border: "1px solid var(--border)",
            padding: "8px 16px",
            fontSize: "12px",
            borderRadius: "var(--radius)",
          }}
        >
          ↺ REFRESH
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "rgba(255,77,77,0.1)", border: "1px solid var(--red-dim)", borderRadius: "var(--radius)", padding: "12px 16px", marginBottom: "16px", color: "var(--red)", fontFamily: "var(--mono)", fontSize: "12px" }}>
          ERROR: {error}
        </div>
      )}

      {/* Table */}
      <div style={{ border: "1px solid var(--border)", borderRadius: "4px", overflow: "hidden" }}>
        {/* Header row */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "2fr 100px 180px 80px 110px 90px",
          background: "var(--surface2)",
          borderBottom: "1px solid var(--border)",
          padding: "10px 16px",
          gap: "12px",
        }}>
          {[
            { label: "FILENAME", col: "filename" },
            { label: "STATUS", col: "status" },
            { label: "PROGRESS", col: null },
            { label: "RETRIES", col: null },
            { label: "QUEUED", col: "queued_at" },
            { label: "ACTIONS", col: null },
          ].map(({ label, col }) => (
            <span
              key={label}
              onClick={col ? () => handleSort(col) : undefined}
              style={{
                fontFamily: "var(--mono)",
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                color: "var(--text-dim)",
                cursor: col ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                userSelect: "none",
              }}
            >
              {label}{col && <SortIcon col={col} />}
            </span>
          ))}
        </div>

        {/* Rows */}
        {loading && !jobs.length && (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "13px" }}>
            LOADING...
          </div>
        )}
        {!loading && !jobs.length && (
          <div style={{ padding: "48px", textAlign: "center", color: "var(--text-muted)", fontFamily: "var(--mono)", fontSize: "13px" }}>
            NO JOBS FOUND
          </div>
        )}
        {jobs.map((job, idx) => (
          <div
            key={job.id}
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 100px 180px 80px 110px 90px",
              padding: "12px 16px",
              gap: "12px",
              borderBottom: idx < jobs.length - 1 ? "1px solid var(--border)" : "none",
              background: idx % 2 === 0 ? "var(--surface)" : "transparent",
              alignItems: "center",
              cursor: "pointer",
              transition: "background 0.1s",
            }}
            onClick={() => nav(`/jobs/${job.id}`)}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "var(--surface2)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = idx % 2 === 0 ? "var(--surface)" : "transparent")}
          >
            <span style={{
              fontFamily: "var(--mono)",
              fontSize: "13px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {job.original_filename}
            </span>

            <StatusBadge status={job.status as JobStatus} />

            <div>
              <ProgressBar
                pct={job.progress_pct}
                failed={job.status === "failed"}
                stage={job.current_stage}
              />
            </div>

            <span style={{ fontFamily: "var(--mono)", fontSize: "12px", color: job.retry_count > 0 ? "var(--yellow)" : "var(--text-muted)", textAlign: "center" }}>
              {job.retry_count}×
            </span>

            <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)" }}>
              {formatDistanceToNow(new Date(job.queued_at), { addSuffix: true })}
            </span>

            <span
              style={{
                fontFamily: "var(--mono)",
                fontSize: "11px",
                color: "var(--accent)",
                fontWeight: 600,
              }}
              onClick={(e) => { e.stopPropagation(); nav(`/jobs/${job.id}`); }}
            >
              VIEW →
            </span>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px" }}>
          <button
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            style={{
              background: "var(--surface2)",
              color: page === 1 ? "var(--text-muted)" : "var(--text)",
              border: "1px solid var(--border)",
              padding: "6px 14px",
              fontSize: "12px",
              borderRadius: "var(--radius)",
              fontFamily: "var(--mono)",
            }}
          >
            ← PREV
          </button>
          <span style={{ fontFamily: "var(--mono)", fontSize: "12px", color: "var(--text-dim)", padding: "6px 12px" }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            style={{
              background: "var(--surface2)",
              color: page >= totalPages ? "var(--text-muted)" : "var(--text)",
              border: "1px solid var(--border)",
              padding: "6px 14px",
              fontSize: "12px",
              borderRadius: "var(--radius)",
              fontFamily: "var(--mono)",
            }}
          >
            NEXT →
          </button>
        </div>
      )}
    </div>
  );
}
