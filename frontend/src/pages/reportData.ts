export type ReportRow = Record<string, string | number | boolean | null>;

export const MEASURE_COLUMNS = new Set([
  "qty", "refundQty", "grossSales", "discount", "netSalesBeforeRefund", "netSales", "cogs", "gp", "gpPercent",
  "refundValue", "netQty", "billCount", "cogsMissing", "paymentValue", "stockValue", "unitCost",
  "movementValue", "qtyIn", "qtyOut", "qtyBefore", "qtyAfter", "ageDays", "amount",
  "receivedQty", "lineValue", "openingBalance", "cashMovementValue", "cashierSessionCount",
  "expectedCash", "countedCash", "variance",
]);

function dateBucket(value: ReportRow[string], granularity: "DAY" | "WEEK" | "MONTH") {
  const day = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return String(value ?? "—");
  if (granularity === "MONTH") return day.slice(0, 7);
  if (granularity === "WEEK") {
    const monday = new Date(`${day}T00:00:00Z`);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return `Week of ${monday.toISOString().slice(0, 10)}`;
  }
  return day;
}

export function groupRows(rows: ReportRow[], dimension: string, granularity: "DAY" | "WEEK" | "MONTH"): ReportRow[] {
  const grouped = new Map<string, ReportRow>();
  const invoiceKeys = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = dimension === "reportDate"
      ? dateBucket(row.reportDate, granularity)
      : dimension === "product" && row.sku ? `${row.sku}\u0000${row.product}`
      : String(row[dimension] ?? "—");
    const invoices = invoiceKeys.get(key) ?? new Set<string>();
    if (Number(row.billCount ?? 0) > 0 && row.invoice !== null && row.invoice !== undefined) {
      invoices.add(JSON.stringify([row.location ?? null, row.invoice]));
    }
    invoiceKeys.set(key, invoices);
    const current = grouped.get(key);
    if (!current) {
      const summary: ReportRow = { [dimension]: dimension === "product" ? row.product ?? key : key };
      if (dimension === "product") {
        for (const field of ["sku", "categoryLevel1", "categoryLevel2", "categoryLevel3", "primarySupplier"]) {
          if (field in row) summary[field] = row[field];
        }
      }
      for (const column of MEASURE_COLUMNS) {
        if (column in row) summary[column] = column === "billCount" ? 0 : Number(row[column] ?? 0);
      }
      grouped.set(key, summary);
      continue;
    }
    for (const column of MEASURE_COLUMNS) {
      if (column in row && column !== "billCount") current[column] = Number(current[column] ?? 0) + Number(row[column] ?? 0);
    }
  }
  return [...grouped.values()].map((row) => {
    if ("billCount" in row) {
      const key = dimension === "product" && row.sku ? `${row.sku}\u0000${row.product}` : String(row[dimension] ?? "—");
      row.billCount = invoiceKeys.get(key)?.size ?? 0;
    }
    if (Number(row.cogsMissing ?? 0) > 0) {
      row.cogs = null;
      row.gp = null;
      row.gpPercent = null;
    } else if ("gp" in row && "netSales" in row) {
      row.gpPercent = Number(row.netSales) === 0 ? 0 : Number(row.gp) / Number(row.netSales) * 100;
    }
    return row;
  });
}

export function formatReportDate(value: ReportRow[string]): string {
  const day = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : day;
}

export function filterReportRows(rows: ReportRow[], filters: Record<string, string>): ReportRow[] {
  return rows.filter(row => Object.entries(filters).every(([field, value]) => !value || String(row[field] ?? '') === value));
}

export function reportFilterOptions(rows: ReportRow[], field: string): string[] {
  return [...new Set(rows.map(row => String(row[field] ?? '')).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function reportSelectorOptions(rows: ReportRow[], field: string) {
  const productsBySku = field === 'sku'
    ? new Map(rows.filter(row => row.sku).map(row => [String(row.sku), String(row.product ?? 'Product')]))
    : null;
  return reportFilterOptions(rows, field).map(value => ({
    value,
    label: field === 'sku' ? `${value} — ${productsBySku?.get(value) ?? 'Product'}` : value,
  }));
}

export function paginateReportRows<T>(rows: T[], requestedPage: number, size: number) {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const page = Math.max(1, Math.min(requestedPage, totalPages));
  const visiblePages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter(value => value >= 1 && value <= totalPages).sort((a, b) => a - b);
  return {
    page, total, totalPages, visiblePages,
    from: total ? (page - 1) * size + 1 : 0,
    to: Math.min(page * size, total),
    rows: rows.slice((page - 1) * size, page * size),
  };
}
