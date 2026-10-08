import type { CSSProperties } from "react";
import { formatReportDate, type ReportRow } from "./reportData";
import { LABELS } from "./reportLabels";

const CHART_COLORS = ["#2563eb", "#0ea5a4", "#8b5cf6", "#f59e0b", "#ef6472", "#14b8a6", "#64748b", "#ec4899"];

function chartMeasures(reportId: string): string[] {
  if (reportId === "inventory-movement") return ["qtyIn", "qtyOut"];
  if (reportId === "purchase-orders") return ["qty", "receivedQty"];
  if (reportId === "register-reconciliation") return ["expectedCash", "countedCash"];
  if (reportId === "payment-methods" || reportId === "payment-analysis") return ["paymentValue"];
  if (reportId === "stock-on-hand") return ["qty"];
  if (reportId === "stock-valuation" || reportId === "inventory-aging" || reportId === "inventory-position") return ["stockValue"];
  if (reportId === "refunds") return ["refundValue"];
  if (reportId === "grn-report" || reportId === "supplier-purchases") return ["lineValue"];
  return ["netSales"];
}

export function ReportChart({ reportId, rows, dimension, granularity, hideHeading = false, serverRankedTopN = false }: { hideHeading?: boolean; serverRankedTopN?: boolean; reportId: string; rows: ReportRow[]; dimension: string; granularity: "DAY" | "WEEK" | "MONTH" | "AGGREGATED" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY" }) {
  const measures = chartMeasures(reportId);
  const isTimeDimension = dimension === "reportDate" || dimension === "periodKey";
  const allData = [...rows].map((row) => ({
    label: dimension === "reportDate" ? formatReportDate(row[dimension])
      : dimension === "product" && serverRankedTopN ? `${row.sku ?? ""} — ${row.product ?? ""}`
        : String(row[dimension] ?? "—"),
    sortKey: String(row[dimension] ?? ""), row,
  }));
  const isDonut = ((reportId === "payment-methods" || reportId === "payment-analysis") && dimension === "paymentMethod")
    || (reportId === "inventory-aging" && dimension === "agingBucket");
  const sortedData = serverRankedTopN ? allData : isTimeDimension
    ? allData.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
    : allData.sort((a, b) => Number(b.row[measures[0]] ?? 0) - Number(a.row[measures[0]] ?? 0));
  const data = serverRankedTopN || isDonut || isTimeDimension ? sortedData : sortedData.slice(0, 8);
  const total = data.reduce((sum, item) => sum + Math.max(0, Number(item.row[measures[0]] ?? 0)), 0);
  const number = (value: ReportRow[string]) => Number(value ?? 0);
  const formatted = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

  if (!data.length || !measures.some((measure) => rows.some((row) => Number(row[measure] ?? 0) !== 0))) return null;

  if (isDonut) {
    let cursor = 0;
    const slices = data.map((item, index) => {
      const value = Math.max(0, number(item.row[measures[0]]));
      const start = cursor;
      cursor += total > 0 ? value / total * 100 : 0;
      return { ...item, value, color: CHART_COLORS[index % CHART_COLORS.length], start, end: cursor };
    });
    const gradient = slices.map((slice) => `${slice.color} ${slice.start}% ${slice.end}%`).join(", ");
    return (
      <section className="card report-chart-card">
        {!hideHeading && <div className="report-chart-heading"><div><h3>{reportId === "payment-methods" || reportId === "payment-analysis" ? "Payment mix" : "Stock age profile"}</h3><p>Share of {LABELS[measures[0]]?.toLowerCase()} by {LABELS[dimension]?.toLowerCase() ?? "group"}</p></div></div>}
        <div className="report-donut-layout">
          <div className="report-donut" role="img" aria-label={`${LABELS[measures[0]]} distribution by ${LABELS[dimension]}`} style={{ "--report-donut": `conic-gradient(${gradient})` } as CSSProperties}>
            <div><strong>{formatted(total)}</strong><span>{LABELS[measures[0]]}</span></div>
          </div>
          <div className="report-chart-legend">
            {slices.map((slice) => <div className="report-legend-row" key={slice.label}><span style={{ background: slice.color }} /><strong>{slice.label}</strong><span>{total ? `${(slice.value / total * 100).toFixed(1)}%` : "0%"}</span></div>)}
          </div>
        </div>
        {serverRankedTopN && <p className="report-chart-footnote">Top {data.length} by {LABELS[measures[0]] ?? measures[0]}.</p>}
      </section>
    );
  }

  if (isTimeDimension && measures.length === 1) {
    const values = data.map(({ row }) => number(row[measures[0]]));
    const maxValue = Math.max(0, ...values);
    const minValue = Math.min(0, ...values);
    const range = Math.max(1, maxValue - minValue);
    const chartWidth = 900;
    const chartHeight = 250;
    const left = 62;
    const right = 22;
    const top = 20;
    const bottom = 42;
    const plotWidth = chartWidth - left - right;
    const plotHeight = chartHeight - top - bottom;
    const points = values.map((value, index) => ({
      x: left + (values.length === 1 ? plotWidth / 2 : index / (values.length - 1) * plotWidth),
      y: top + (maxValue - value) / range * plotHeight,
      value,
    }));
    const labelIndexes = new Set(Array.from({ length: Math.min(data.length, 6) }, (_, index) =>
      data.length <= 1 ? 0 : Math.round(index * (data.length - 1) / (Math.min(data.length, 6) - 1)),
    ));
    return (
      <section className="card report-chart-card">
        {!hideHeading && <div className="report-chart-heading"><div><h3>Performance over time</h3><p>{LABELS[measures[0]]} by {granularity.toLowerCase()}</p></div></div>}
        <div className="report-line-chart">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} role="img" aria-label={`${LABELS[measures[0]]} trend over time`}>
            {[0, 0.5, 1].map((fraction) => {
              const y = top + plotHeight * fraction;
                return <g key={fraction}><line x1={left} x2={chartWidth - right} y1={y} y2={y} className="report-chart-gridline" /><text x={left - 10} y={y + 4} textAnchor="end" className="report-chart-axis-label">{formatted(maxValue - range * fraction)}</text></g>;
            })}
            {points.length > 1 && <polyline points={points.map(({ x, y }) => `${x},${y}`).join(" ")} className="report-line-path" />}
            {points.map((point, index) => <circle key={data[index].label} cx={point.x} cy={point.y} r="4" className="report-line-point"><title>{`${data[index].label}: ${formatted(point.value)}`}</title></circle>)}
            {data.map((item, index) => labelIndexes.has(index) && <text key={item.label} x={points[index].x} y={chartHeight - 12} textAnchor="middle" className="report-chart-axis-label">{item.label.slice(0, 12)}</text>)}
          </svg>
        </div>
      </section>
    );
  }

  const maxValue = Math.max(1, ...data.flatMap(({ row }) => measures.map((measure) => Math.abs(number(row[measure])))));
  return (
    <section className="card report-chart-card">
      {!hideHeading && <div className="report-chart-heading">
        <div>
          <h3>{isTimeDimension ? "Performance over time" : "Performance breakdown"}</h3>
          <p>{measures.map((measure) => LABELS[measure]?.toLowerCase()).join(" vs ")} by {LABELS[dimension]?.toLowerCase() ?? "report detail"}</p>
        </div>
        {measures.length > 1 && <div className="report-chart-keys">{measures.map((measure, index) => <span key={measure}><i style={{ background: CHART_COLORS[index] }} />{LABELS[measure]}</span>)}</div>}
      </div>}
      <div className="report-bars">
        {data.map(({ label, row }, rowIndex) => (
          <div className="report-bar-row" key={`${label}-${rowIndex}`}>
            <span className="report-bar-label" title={label}>{label}</span>
            <div className="report-bar-stack">
              {measures.map((measure, index) => {
                const value = number(row[measure]);
                const width = value ? Math.max(1, Math.abs(value) / maxValue * 100) : 0;
                return <div className="report-bar-series" key={measure}>
                  <div className="report-bar-track"><div className="report-bar-fill" style={{ width: `${width}%`, background: value < 0 ? "#ef6472" : CHART_COLORS[index] }} /></div>
                  <strong>{formatted(value)}</strong>
                </div>;
              })}
            </div>
          </div>
        ))}
      </div>
      {serverRankedTopN ? <p className="report-chart-footnote">Top {data.length} by {LABELS[measures[0]] ?? measures[0]}.</p>
        : rows.length > data.length && <p className="report-chart-footnote">Showing the top {data.length} of {rows.length} groups.</p>}
    </section>
  );
}

