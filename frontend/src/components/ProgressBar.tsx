interface Props {
  pct: number;
  failed?: boolean;
  stage?: string | null;
}

export default function ProgressBar({ pct, failed, stage }: Props) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-dim)" }}>
          {stage ? stage.replace(/_/g, " ").toUpperCase() : "—"}
        </span>
        <span style={{ fontFamily: "var(--mono)", fontSize: "11px", color: failed ? "var(--red)" : "var(--accent)" }}>
          {pct}%
        </span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill${failed ? " progress-fill-failed" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
