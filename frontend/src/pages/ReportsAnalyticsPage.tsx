import { useSearchParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../services/apiClient";
import { useAuth } from "../features/auth/AuthContext";
import { SearchableSelect } from "../components/ui/SearchableSelect";
import { ReportChart } from "./ReportChart";
import { dashboardDateRange } from "./dashboardData";
import { LABELS } from "./reportLabels";
import { downloadFile, reportCsv, reportPdf } from "./reportExport";

import { MEASURE_COLUMNS, filterReportRows, formatReportDate, reportFilterOptions, reportSelectorOptions, groupRows, paginateReportRows } from "./reportData";
import type { ReportRow } from "./reportData";
type ReportResponse = {
  reportId: string;
  from: string;
  to: string;
  rows: ReportRow[];
  rowCount: number;
  measures: string[];
};
type ReportDefinition = {
  id: string;
  name: string;
  description: string;
  groupBy: string[];
  permission: string;
};
type ReportGroup = { name: string; icon: string; reports: ReportDefinition[] };

const REPORT_GROUPS: ReportGroup[] = [
  {
    name: "Sales performance",
    icon: "sales",
    reports: [
      { id: "gross-sales", name: "Gross Sales Summary", description: "Sales performance by date, location, category, product, and invoice.", groupBy: ["location", "reportDate", "categoryLevel1", "categoryLevel2", "categoryLevel3", "product", "invoice"], permission: "SALES_INVOICE_VIEW" },
      { id: "daily-sales", name: "Daily Sales Report", description: "Daily invoice and invoice-line sales detail.", groupBy: ["reportDate", "invoice", "product"], permission: "SALES_INVOICE_VIEW" },
      { id: "product-sales", name: "Product Sales Report", description: "Product and SKU sales with invoice-line detail.", groupBy: ["product", "invoice", "reportDate"], permission: "SALES_INVOICE_VIEW" },
      { id: "category-sales", name: "Category Sales Report", description: "Category performance at Level 1, 2, or 3.", groupBy: ["categoryLevel1", "categoryLevel2", "categoryLevel3", "product", "invoice"], permission: "SALES_INVOICE_VIEW" },
      { id: "cashier-sales", name: "Cashier Sales Report", description: "Sales by cashier with invoice-line detail.", groupBy: ["cashier", "invoice", "product"], permission: "SALES_INVOICE_VIEW" },
      { id: "customer-sales", name: "Customer Sales Report", description: "Customer purchases with product and invoice detail.", groupBy: ["customer", "product", "invoice"], permission: "SALES_INVOICE_VIEW" },
      { id: "supplier-sales", name: "Sales by Primary Supplier", description: "Product sales attributed to each product's primary supplier.", groupBy: ["primarySupplier", "product", "invoice"], permission: "SALES_INVOICE_VIEW" },
    ],
  },
  {
    name: "Payments & credit",
    icon: "payments",
    reports: [
      { id: "payment-methods", name: "Payment Method Report", description: "Payments by method, channel, and invoice.", groupBy: ["paymentMethod", "channel", "invoice"], permission: "SALES_INVOICE_VIEW" },
      { id: "credit-sales", name: "Credit Sales Report", description: "Credit invoices by customer, invoice, and product.", groupBy: ["customer", "invoice", "product"], permission: "SALES_INVOICE_VIEW" },
    ],
  },
  {
    name: "Inventory insights",
    icon: "inventory",
    reports: [
      { id: "stock-on-hand", name: "Stock on Hand", description: "Available quantity by location, category, supplier, and product.", groupBy: ["location", "category", "primarySupplier", "product"], permission: "INVENTORY_ADJUSTMENT_VIEW" },
      { id: "stock-valuation", name: "Stock Valuation", description: "On-hand stock valued using average cost by location, category, brand, and supplier.", groupBy: ["location", "category", "brand", "primarySupplier", "product"], permission: "INVENTORY_ADJUSTMENT_VIEW" },
      { id: "inventory-movement", name: "Inventory Movement", description: "Ledger movements and their source documents.", groupBy: ["location", "movementType", "product", "sourceDocumentId"], permission: "INVENTORY_ADJUSTMENT_VIEW" },
      { id: "inventory-aging", name: "Inventory Aging", description: "Remaining receipt layers by aging bucket, product, batch, and expiry.", groupBy: ["agingBucket", "category", "primarySupplier", "product", "receiptDate"], permission: "INVENTORY_ADJUSTMENT_VIEW" },
    ],
  },
  {
    name: "Purchasing",
    icon: "purchasing",
    reports: [
      { id: "purchase-orders", name: "Purchase Order Report", description: "Purchase orders by supplier and status with product lines.", groupBy: ["supplier", "status", "purchaseOrder", "product"], permission: "PURCHASE_ORDER_VIEW" },
      { id: "grn-report", name: "GRN Report", description: "Posted goods receipts by supplier and location.", groupBy: ["supplier", "location", "grn", "product"], permission: "GRN_VIEW" },
      { id: "supplier-purchases", name: "Supplier Purchase Report", description: "Received products and values by supplier.", groupBy: ["supplier", "product", "grn"], permission: "GRN_VIEW" },
    ],
  },
  {
    name: "Returns & refunds",
    icon: "refunds",
    reports: [
      { id: "refunds", name: "Refund Report", description: "Completed refunds by category, supplier, product, refund, and original invoice.", groupBy: ["category", "primarySupplier", "product", "refund", "originalInvoice"], permission: "SALES_REFUND_VIEW" },
    ],
  },
  {
    name: "Cash & registers",
    icon: "registers",
    reports: [
      { id: "register-reconciliation", name: "Register Reconciliation", description: "Register sessions, terminal and cashier sessions, payments, and cash movements.", groupBy: ["location", "register", "terminal", "reportDate", "eventType"], permission: "SALES_REGISTER_CLOSE" },
    ],
  },
];

const GROUP_ICONS: Record<string, string> = {
  sales: "M4 16V10 M10 16V6 M16 16V3 M2 19H20",
  payments: "M3 5H19V17H3Z M3 9H19 M6 13H10",
  inventory: "M3 6L11 2L19 6V16L11 20L3 16Z M3 6L11 10L19 6 M11 10V20",
  purchasing: "M3 3H5L7 14H17L20 6H6 M9 18H9.01 M16 18H16.01",
  refunds: "M7 5H16A5 5 0 0 1 16 15H6 M7 5L11 1 M7 5L11 9",
  registers: "M4 8H18L20 19H2Z M7 8V3H15V8 M6 13H8 M11 13H13 M16 13H17 M6 16H8 M11 16H13",
};

function displayValue(value: ReportRow[string], column: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (column === "reportDate") return formatReportDate(value);
  if (MEASURE_COLUMNS.has(column) && typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (MEASURE_COLUMNS.has(column) && typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}

export function ReportsAnalyticsPage() {
  const { permissions, accessScope, tenant } = useAuth();
  const availableGroups = useMemo(
    () => REPORT_GROUPS.map((group) => ({ ...group, reports: group.reports.filter((report) => permissions.includes(report.permission)) }))
      .filter((group) => group.reports.length > 0),
    [permissions],
  );
  const firstReport = availableGroups[0]?.reports[0];
  const [searchParams] = useSearchParams();
  const defaultPeriod = dashboardDateRange(new Date(), tenant?.timeZone ?? "Asia/Colombo", 30);
  const [reportId, setReportId] = useState(() => availableGroups.flatMap(group => group.reports).find(report => report.id === searchParams.get("report"))?.id ?? firstReport?.id ?? "");
  const [from, setFrom] = useState(() => searchParams.get("from") || defaultPeriod.from);
  const [to, setTo] = useState(() => searchParams.get("to") || defaultPeriod.to);
  const [locationId, setLocationId] = useState(() => searchParams.get("locationId") || "");
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [exportError, setExportError] = useState("");
  const [granularity, setGranularity] = useState<"DAY" | "WEEK" | "MONTH">("DAY");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState("");
  const [view, setView] = useState<"SUMMARY" | "DETAIL">("SUMMARY");
  const [pageSize, setPageSize] = useState(20);
  const [pageSelection, setPageSelection] = useState({ key: "", page: 1 });

  const selectedReport = availableGroups.flatMap((group) => group.reports).find((report) => report.id === reportId) ?? firstReport;
  const query = useQuery({
    queryKey: ["report", reportId, from, to, locationId],
    queryFn: () => apiClient.get<ReportResponse>(`/reports/${reportId}?${new URLSearchParams({ from, to, ...(locationId ? { locationId } : {}) })}`),
    enabled: Boolean(selectedReport && from && to && from <= to),
  });
  const locations = useQuery({
    queryKey: ["report-locations"],
    queryFn: () => apiClient.get<Array<{ locationId: number; code: string; name: string }>>("/reports/locations"),
    enabled: availableGroups.length > 0,
  });
  const rows = query.data?.rows ?? [];
  const filterFields = ["categoryLevel1", "categoryLevel2", "categoryLevel3", "category", "brand", "primarySupplier", "supplier", "sku", "cashier", "customer", "paymentMethod", "channel", "status", "movementType", "agingBucket", "register", "terminal", "eventType", "reconciliationStatus"]
    .filter(field => field !== "category" || !rows.some(row => "categoryLevel1" in row))
    .filter(field => rows.some(row => field in row));
  const searchableFields = new Set(["categoryLevel1", "categoryLevel2", "categoryLevel3", "category", "primarySupplier", "supplier", "sku", "cashier", "customer", "brand"]);
  const filterOptions = (field: string) => {
    const source = field === "categoryLevel2" && filters.categoryLevel1
      ? rows.filter(row => row.categoryLevel1 === filters.categoryLevel1)
      : field === "categoryLevel3"
        ? rows.filter(row => (!filters.categoryLevel1 || row.categoryLevel1 === filters.categoryLevel1) && (!filters.categoryLevel2 || row.categoryLevel2 === filters.categoryLevel2))
        : rows;
    return reportSelectorOptions(source, field);
  };
  const changeFilter = (field: string, value: string) => setFilters(current => ({
    ...current, [field]: value,
    ...(field === "categoryLevel1" ? { categoryLevel2: "", categoryLevel3: "" } : {}),
    ...(field === "categoryLevel2" ? { categoryLevel3: "" } : {}),
  }));
  const groupOptions = [...new Set([...(selectedReport?.groupBy ?? []), ...filterFields])];
  const dimension = groupOptions.includes(groupBy) ? groupBy : selectedReport?.groupBy[0] ?? "";
  const filteredRows = filterReportRows(rows, filters);
  const chartRows = dimension ? groupRows(filteredRows, dimension, granularity) : [];
  const displayedRows = view === "SUMMARY" && dimension ? chartRows : filteredRows;
  const paginationKey = JSON.stringify([reportId, from, to, locationId, filters, dimension, granularity, view, pageSize]);
  const pagination = paginateReportRows(displayedRows, pageSelection.key === paginationKey ? pageSelection.page : 1, pageSize);
  const goToPage = (page: number) => setPageSelection({ key: paginationKey, page });
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const columns = displayedRows.length
    ? [...new Set(displayedRows.flatMap((row) => Object.keys(row)))]
    : [];
  const isSnapshotReport = ["stock-on-hand", "stock-valuation", "inventory-aging"].includes(reportId);
  const statisticFields: Array<[string, string]> = reportId === "gross-sales" || reportId === "daily-sales" || reportId === "product-sales" || reportId === "category-sales" || reportId === "cashier-sales" || reportId === "customer-sales" || reportId === "supplier-sales" || reportId === "credit-sales"
    ? [["Gross Sales", "grossSales"], ["Discount", "discount"], ["Actual Net Sales", "netSales"], ["GP", "gp"]]
    : reportId === "payment-methods"
    ? [["Payment Value", "paymentValue"], ["Invoices", "invoice"], ["", ""], ["", ""]]
    : reportId === "stock-on-hand"
    ? [["On-hand Qty", "qty"], ["Products", "sku"], ["", ""], ["", ""]]
    : reportId === "stock-valuation"
    ? [["Stock Value", "stockValue"], ["On-hand Qty", "qty"], ["", ""], ["", ""]]
    : reportId === "inventory-aging"
    ? [["Remaining Qty", "qty"], ["Stock Value", "stockValue"], ["Layers", "ageLayerId"], ["", ""]]
    : reportId === "inventory-movement"
    ? [["Qty In", "qtyIn"], ["Qty Out", "qtyOut"], ["Movement Value", "movementValue"], ["", ""]]
    : reportId === "purchase-orders"
    ? [["Ordered Qty", "qty"], ["Received Qty", "receivedQty"], ["Purchase Value", "lineValue"], ["", ""]]
    : reportId === "grn-report" || reportId === "supplier-purchases"
    ? [["Received Qty", "qty"], ["Purchase Value", "lineValue"], ["", ""], ["", ""]]
    : reportId === "refunds"
    ? [["Refund Value", "refundValue"], ["Refunded Qty", "qty"], ["", ""], ["", ""]]
    : [["Expected Cash", "expectedCash"], ["Counted Cash", "countedCash"], ["Variance", "variance"], ["Cash Movements", "cashMovementValue"]];
  const statisticValue = (field: string) => {
    if (field === "sku" || field === "sourceDocumentId" || field === "ageLayerId" || field === "invoice") {
      return new Set(filteredRows.map((row) => String(row[field] ?? ""))).size;
    }
    return filteredRows.reduce((sum, row) => sum + Number(row[field] ?? 0), 0);
  };

  const chooseReport = (id: string) => {
    setReportId(id);
    setFilters({});
    setGroupBy("");
    setView("SUMMARY");
    setGranularity("DAY");
    setExportError("");
  };

  const resetFilters = () => {
    const period = dashboardDateRange(new Date(), tenant?.timeZone ?? "Asia/Colombo", 30);
    setFrom(period.from);
    setTo(period.to);
    setLocationId("");
    setFilters({});
    setGroupBy("");
    setView("SUMMARY");
    setGranularity("DAY");
    setExportError("");
    setPageSelection({ key: "", page: 1 });
  };

  const exportReport = async (format: "csv" | "pdf") => {
    if (!selectedReport || query.isFetching || query.isError || !displayedRows.length || exporting) return;
    setExportError("");
    setExporting(format);
    try {
      const headers = columns.map(column => LABELS[column] ?? column);
      const values = displayedRows.map(row => columns.map(column => column === "reportDate" ? displayValue(row[column], column) : row[column]));
      const filename = `${selectedReport.id}-${isSnapshotReport ? "snapshot" : `${from}-to-${to}`}.${format}`;
      const blob = format === "csv"
        ? new Blob([reportCsv(headers, values)], { type: "text/csv;charset=utf-8" })
        : await reportPdf({
            title: selectedReport.name,
            metadata: [
              isSnapshotReport ? "Current stock snapshot" : `Period: ${formatReportDate(from)} to ${formatReportDate(to)}`,
              `Location: ${locations.data?.find(location => String(location.locationId) === locationId)?.name ?? "All accessible locations"}`,
              `View: ${view === "SUMMARY" ? "Summary" : "Detailed"} | Group by: ${LABELS[dimension] ?? dimension}`,
              ...activeFilters.map(([field, value]) => `${LABELS[field] ?? field}: ${value}`),
              `Date granularity: ${granularity} | Generated: ${new Date().toLocaleString()}`,
            ],
            headers,
            rows: displayedRows.map(row => columns.map(column => displayValue(row[column], column))),
          });
      downloadFile(blob, filename);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Unable to export the report. Please try again.");
    } finally {
      setExporting(null);
    }
  };
  const exportDisabled = query.isFetching || query.isError || from > to || !displayedRows.length || exporting !== null;

  return (
    <div className="reports-page">
      <div className="page-head">
        <div>
          <div className="eyebrow">INSIGHTS</div>
          <h1>Reports &amp; Analytics</h1>
          <p>Choose your filters and view to explore performance and the records behind each result.</p>
        </div>
      </div>

      <div className="reports-layout">
        <aside className="reports-catalog card">
          <div className="reports-catalog-heading">REPORT LIBRARY</div>
          {availableGroups.length === 0 ? (
            <p className="reports-empty">Your role does not have permission to view reports.</p>
          ) : availableGroups.map((group) => (
            <section className="reports-group" key={group.name}>
              <h2 className="reports-section-title">
                <span className="reports-section-icon" aria-hidden="true">
                  <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={GROUP_ICONS[group.icon]} /></svg>
                </span>
                <span>{group.name}</span>
              </h2>
              {group.reports.map((report) => (
                <button
                  type="button"
                  className={`reports-link${selectedReport?.id === report.id ? " active" : ""}`}
                  key={report.id}
                  onClick={() => chooseReport(report.id)}
                  aria-current={selectedReport?.id === report.id ? "page" : undefined}
                >
                  {report.name}
                </button>
              ))}
            </section>
          ))}
        </aside>

        <section className="reports-workspace">
          {!selectedReport ? (
            <div className="card reports-empty">No reports are available for this role.</div>
          ) : (
            <>
              <div className="page-head reports-report-heading">
                <div>
                  <h2>{selectedReport.name}</h2>
                  <p>{selectedReport.description}</p>
                  <p className="reports-period">Period: {isSnapshotReport ? "Current stock snapshot" : `${formatReportDate(from)} to ${formatReportDate(to)}`}</p>
                </div>
              </div>

              <div className="card reports-filters reports-filter-panel">
                <div className="reports-filter-heading">
                  <div><h3>Report filters</h3><p>Choose what to include and how to display it.</p></div>
                  <button type="button" className="btn" onClick={resetFilters}>Reset filters</button>
                </div>
                <div className="reports-filter-grid">
                  {!isSnapshotReport && <label>From <input className="control" type="date" value={from} max={to} onChange={event => setFrom(event.target.value)} /></label>}
                  {!isSnapshotReport && <label>To <input className="control" type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label>}
                  <SearchableSelect label="Location" value={locationId} onChange={setLocationId}
                    options={(locations.data ?? []).map(location => ({ value: String(location.locationId), label: location.name, code: location.code }))}
                    placeholder="Search location" emptyMessage="No matching locations" clearLabel="All accessible locations" />
                  <label>View
                    <select className="control" value={view} onChange={event => setView(event.target.value as "SUMMARY" | "DETAIL")}>
                      <option value="SUMMARY">Summary</option><option value="DETAIL">Detailed records</option>
                    </select>
                  </label>
                  {groupOptions.includes("reportDate") && <label>Date granularity
                    <select className="control" value={granularity} disabled={dimension !== "reportDate"} title="Applies when grouping by Date" onChange={event => setGranularity(event.target.value as "DAY" | "WEEK" | "MONTH")}>
                      <option value="DAY">Day</option><option value="WEEK">Week</option><option value="MONTH">Month</option>
                    </select>
                  </label>}
                  <label>Group by
                    <select className="control" value={dimension} onChange={event => setGroupBy(event.target.value)}>
                      {groupOptions.map(field => <option key={field} value={field}>{LABELS[field] ?? field}</option>)}
                    </select>
                  </label>
                </div>
                {filterFields.length > 0 && <details className="reports-more-filters" open>
                  <summary>Refine results{activeFilters.length ? ` (${activeFilters.length} active)` : ""}</summary>
                  <div className="reports-filter-grid">
                    {filterFields.map(field => searchableFields.has(field)
                      ? <SearchableSelect key={field} label={field === "sku" ? "Product / SKU" : LABELS[field] ?? field}
                          value={filters[field] ?? ""} onChange={value => changeFilter(field, value)}
                          options={filterOptions(field)} placeholder={field === "sku" ? "Search SKU / product name" : `Search ${LABELS[field] ?? field}`}
                          emptyMessage="No matching options" clearLabel="All" />
                      : <label key={field}>{LABELS[field] ?? field}
                          <select className="control" value={filters[field] ?? ""} onChange={event => changeFilter(field, event.target.value)}>
                            <option value="">All</option>
                            {reportFilterOptions(rows, field).map(value => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </label>)}
                  </div>
                </details>}
                {activeFilters.length > 0 && <div className="reports-active-filters" aria-label="Active filters">
                  {activeFilters.map(([field, value]) => <button key={field} type="button" aria-label={`Remove ${LABELS[field] ?? field} filter: ${value}`} onClick={() => changeFilter(field, "")}>
                    {LABELS[field] ?? field}: {value} <span aria-hidden="true">&#215;</span>
                  </button>)}
                </div>}
              </div>

              {exportError && <div className="error-box" role="alert">{exportError}</div>}
              {query.isError && <div className="error-box">{query.error instanceof Error ? query.error.message : "Unable to load this report."}</div>}
              {locations.isError && <div className="error-box">{locations.error instanceof Error ? locations.error.message : "Unable to load locations."}</div>}
              {from > to && <div className="error-box">The start date must be on or before the end date.</div>}
              {filteredRows.some(row => Number(row.cogsMissing ?? 0) > 0) && <div className="error-box" role="status">Some stock-item transactions have no saved cost ledger entry. COGS and GP for affected groups are unavailable.</div>}

              <div className="stats-row reports-stats">
                {statisticFields.map(([label, field], index) => label ? (
                  <div className="stat-card" key={`${field}-${index}`}>
                    <span>{label}</span>
                    <strong>{field === "gp" && filteredRows.some(row => Number(row.cogsMissing ?? 0) > 0)
                      ? "Incomplete"
                      : statisticValue(field).toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                  </div>
                ) : <div key={`empty-${index}`} />)}
              </div>

              {query.isLoading ? (
                <div className="card reports-empty">Loading chart…</div>
              ) : chartRows.length > 0 && dimension ? (
                <ReportChart reportId={reportId} rows={chartRows} dimension={dimension} granularity={granularity} />
              ) : null}

              <div className="card reports-results">
                <div className="toolbar">
                  <div className="reports-result-heading">
                    <strong>{view === "SUMMARY" ? "Summary" : "Detailed records"}</strong>
                    <span>{view === "SUMMARY" ? `Grouped by ${LABELS[dimension] ?? dimension}` : "Individual records matching your filters"}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span>{query.isFetching ? "Updating…" : `${displayedRows.length} matching rows`}</span>
                    <button type="button" className="btn" disabled={exportDisabled} onClick={() => void exportReport("csv")}>
                      {exporting === "csv" ? "Exporting..." : "Export CSV"}
                    </button>
                    <button type="button" className="btn" disabled={exportDisabled} onClick={() => void exportReport("pdf")}>
                      {exporting === "pdf" ? "Exporting..." : "Export PDF"}
                    </button>
                  </div>
                </div>
                {query.isLoading ? <div className="reports-empty">Loading report…</div> : columns.length === 0 ? (
                  <div className="reports-empty">No records found for the selected filters.</div>
                ) : (
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr>{columns.map((column) => <th key={column}>{LABELS[column] ?? column}</th>)}</tr></thead>
                      <tbody>{pagination.rows.map((row, index) => (
                        <tr key={index}>
                          {columns.map(column => <td key={column}>{column === dimension ? <strong>{displayValue(row[column], column)}</strong> : displayValue(row[column], column)}</td>)}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
                <div className="toolbar sales-history-pagination">
                  <span aria-live="polite">{query.isFetching ? "Updating..." : `Showing ${pagination.from}-${pagination.to} of ${pagination.total} records`}</span>
                  <nav className="sales-history-page-controls" aria-label="Report pagination">
                    <button type="button" className="btn btn-secondary" disabled={query.isFetching || pagination.page <= 1} onClick={() => goToPage(pagination.page - 1)}>Previous</button>
                    {pagination.visiblePages.map((number, index) => <span className="sales-history-page-number" key={number}>
                      {index > 0 && number - pagination.visiblePages[index - 1] > 1 && <span aria-hidden="true">&#8230;</span>}
                      <button type="button" className={number === pagination.page ? "btn btn-primary" : "btn btn-secondary"} aria-label={`Page ${number}`} aria-current={number === pagination.page ? "page" : undefined} disabled={query.isFetching || !pagination.total} onClick={() => goToPage(number)}>{number}</button>
                    </span>)}
                    <button type="button" className="btn btn-secondary" disabled={query.isFetching || pagination.page >= pagination.totalPages} onClick={() => goToPage(pagination.page + 1)}>Next</button>
                    <select className="control" aria-label="Rows per page" value={pageSize} onChange={event => setPageSize(Number(event.target.value))}>
                      <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
                    </select>
                  </nav>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
      {accessScope === "LOCATION" && <p className="reports-scope-note">Results are limited to your assigned locations.</p>}
    </div>
  );
}
