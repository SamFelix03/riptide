import type { ReactNode } from "react";

export function Card({ title, children, testId }: { title?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="card corner-ticks grain" data-testid={testId}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  children,
  compact,
}: {
  label: string;
  value?: string;
  hint?: string;
  children?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "stat-compact" : "card stat-tile corner-ticks"} data-testid="stat-tile">
      <div className="label-xs">{label}</div>
      {children ? <div className="stat-value">{children}</div> : value ? <div className="stat-value tabular">{value}</div> : null}
      {hint ? <div className="form-field-hint" style={{ marginTop: "0.35rem" }}>{hint}</div> : null}
    </div>
  );
}

export function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div data-testid="meter">
      <div className="muted">{label} · {pct.toFixed(1)}%</div>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%`, transition: "width 400ms var(--ease-shade)" }} />
      </div>
    </div>
  );
}

export function DataTable({
  headers,
  rows,
  selectedRow,
  onRowClick,
}: {
  headers: string[];
  rows: ReactNode[][];
  selectedRow?: number;
  onRowClick?: (index: number) => void;
}) {
  // Wide numeric tables (route breakdown, fill history, atomic routes) overflow the card
  // on phone widths. Scroll the table, not the page — the page body must never scroll
  // sideways.
  return (
    <div className="table-scroll">
      <table data-testid="data-table">
        <thead>
          <tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={onRowClick || selectedRow === i ? `selectable-row${selectedRow === i ? " is-selected" : ""}` : undefined}
              onClick={onRowClick ? () => onRowClick(i) : undefined}
            >
              {row.map((cell, j) => <td key={j}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return <div className="muted">No data</div>;
  const max = Math.max(...values, 1);
  return (
    <div className="spark-bars" data-testid="sparkline">
      {values.map((v, i) => (
        <span key={i} style={{ height: `${(v / max) * 100}%` }} />
      ))}
    </div>
  );
}

export function FreshnessBadge({ indexedBlock, chainHead, laggingSeconds }: { indexedBlock: string; chainHead: string; laggingSeconds: number }) {
  const stale = laggingSeconds > 30;
  return (
    <span className={`badge ${stale ? "badge-stale" : "badge-verified"}`} data-testid="freshness-badge">
      {stale ? "Stale" : "Fresh"} · indexed #{indexedBlock} · head #{chainHead}
    </span>
  );
}

export function HonestyBadge({ status }: { status: "verified" | "simulation" | "confirm" }) {
  const label = status === "verified" ? "[verified]" : status === "simulation" ? "simulation-validated" : "[confirm at build]";
  return <span className="badge badge-verified" data-testid="honesty-badge">{label}</span>;
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="card muted" data-testid="loading-state">{label}</div>;
}

export function ErrorState({ message, code }: { message: string; code?: string }) {
  return (
    <div className="card error" data-testid="error-state">
      {code ? <div><strong>{code}</strong></div> : null}
      {message}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="card muted" data-testid="empty-state">{message}</div>;
}

export function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="modal-scrim">
      <div className="modal-panel card corner-ticks grain" style={{ width: "min(520px, 92vw)", marginBottom: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
          <h3 className="display-xl" style={{ fontSize: "1.25rem", margin: 0 }}>{title}</h3>
          <button type="button" className="ghost" onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: "1rem" }}>{children}</div>
      </div>
    </div>
  );
}
