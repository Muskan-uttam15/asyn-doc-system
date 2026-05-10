import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";

interface Props { children: ReactNode; }

export default function Layout({ children }: Props) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{
        background: "var(--surface)",
        borderBottom: "1px solid var(--border)",
        padding: "0 32px",
        display: "flex",
        alignItems: "center",
        gap: "32px",
        height: "52px",
        position: "sticky",
        top: 0,
        zIndex: 100,
      }}>
        <span style={{ fontFamily: "var(--mono)", fontWeight: 600, fontSize: "15px", color: "var(--accent)", letterSpacing: "0.04em" }}>
          ▲ DOCFLOW
        </span>
        <div style={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
          {[
            { to: "/upload", label: "UPLOAD" },
            { to: "/dashboard", label: "DASHBOARD" },
          ].map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              style={({ isActive }) => ({
                fontFamily: "var(--mono)",
                fontSize: "11px",
                fontWeight: 600,
                letterSpacing: "0.1em",
                padding: "6px 14px",
                borderRadius: "var(--radius)",
                color: isActive ? "var(--accent)" : "var(--text-dim)",
                background: isActive ? "var(--accent-bg)" : "transparent",
                border: isActive ? "1px solid var(--accent-dim)" : "1px solid transparent",
                transition: "all 0.15s",
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>
        <div style={{ marginLeft: "auto", fontFamily: "var(--mono)", fontSize: "11px", color: "var(--text-muted)" }}>
          ASYNC DOCUMENT PROCESSOR v1.0
        </div>
      </nav>
      <main style={{ flex: 1, padding: "32px", maxWidth: "1280px", margin: "0 auto", width: "100%" }}>
        {children}
      </main>
    </div>
  );
}
