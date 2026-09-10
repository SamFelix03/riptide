"use client";

import { SVGSparkline } from "./primitives";

export function ChartPanel({
  title,
  unit,
  data,
  dataB,
  stroke = "var(--primary)",
  strokeB = "var(--secondary)",
  lastLabel,
}: {
  title: string;
  unit?: string;
  data: number[];
  dataB?: number[];
  stroke?: string;
  strokeB?: string;
  lastLabel?: string;
}) {
  const last = data.length ? data[data.length - 1]! : null;
  const display = lastLabel ?? (last === null ? "—" : last.toLocaleString("en-US", { maximumFractionDigits: 4 }));
  const finite = data.filter((v) => Number.isFinite(v));
  const min = finite.length ? Math.min(...finite) : 0;
  const max = finite.length ? Math.max(...finite) : 0;

  return (
    <div className="chart-panel" data-testid="chart-panel">
      <div className="chart-panel-header">
        <p className="form-field-label" style={{ margin: 0 }}>{title}</p>
        <p className="chart-panel-last tabular">
          {display}
          {unit ? <span className="muted"> {unit}</span> : null}
        </p>
      </div>
      <SVGSparkline data={data} dataB={dataB} stroke={stroke} strokeB={strokeB} unit={unit} />
      {data.length >= 2 ? (
        <div className="chart-panel-axis">
          <span>{max.toLocaleString("en-US", { maximumFractionDigits: 3 })}</span>
          <span>{min.toLocaleString("en-US", { maximumFractionDigits: 3 })}</span>
        </div>
      ) : null}
    </div>
  );
}
