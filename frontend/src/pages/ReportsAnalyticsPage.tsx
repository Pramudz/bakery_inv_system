import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/apiClient';
import { useAuth } from '../features/auth/AuthContext';
import { SearchableSelect } from '../components/ui/SearchableSelect';
import { dashboardDateRange } from './dashboardData';
import { ReportChart } from './ReportChart';
import { chartParameters, showAggregatedChart } from './reportChartPolicy';
import { LABELS } from './reportLabels';
import { downloadFile, reportCsv, reportPdf } from './reportExport';
import { formatReportDate, type ReportRow } from './reportData';
import { columnsFor } from './reportColumns';

type View = 'SUMMARY' | 'ITEM_DETAIL' | 'DOCUMENT_DETAIL';
type Granularity = 'AGGREGATED' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
type ReportDefinition = { id: string; name: string; description: string; permission: string;
  views: View[]; groupBy: string[]; filters: string[]; dated: boolean; snapshot?: boolean; replenishment?: boolean };
type ReportGroup = { name: string; reports: ReportDefinition[] };
type ReportResponse = { reportId: string; rows: ReportRow[]; rowCount: number; page: number; pageSize: number;
  filterOptions: Record<string, Array<{ value: string; label: string }>> };
type ChartResponse = { rows: ReportRow[]; metric: string };

const PRODUCT_FILTERS = ['sku', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier'];
const SALES_GROUPS = ['location', 'product', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'cashier', 'customer', 'primarySupplier', 'brand'];
const REPORT_GROUPS: ReportGroup[] = [
  { name: 'Sales performance', reports: [
    { id: 'sales-analysis', name: 'Sales Analysis', description: 'Sales, refunds, cost and gross profit from saved transaction values.', permission: 'SALES_INVOICE_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'], groupBy: SALES_GROUPS,
      filters: [...PRODUCT_FILTERS, 'cashier', 'customer'], dated: true },
  ] },
  { name: 'Payments & credit', reports: [
    { id: 'payment-analysis', name: 'Payment Analysis', description: 'Applied payments by method, card channel and transaction.', permission: 'SALES_INVOICE_VIEW',
      views: ['SUMMARY', 'DOCUMENT_DETAIL'], groupBy: ['paymentMethod', 'channel', 'location'],
      filters: ['paymentMethod', 'channel', 'cashier', 'customer', 'terminal', 'register'], dated: true },
    { id: 'credit-sales', name: 'Credit Sales', description: 'Credit invoices counted once when sold; collections remain payments.', permission: 'SALES_INVOICE_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'], groupBy: SALES_GROUPS,
      filters: [...PRODUCT_FILTERS, 'cashier', 'customer'], dated: true },
  ] },
  { name: 'Inventory insights', reports: [
    { id: 'inventory-position', name: 'Inventory Position', description: 'Physical on-hand value and company-owned stock in transit.', permission: 'INVENTORY_ADJUSTMENT_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL'], groupBy: ['location', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier'],
      filters: PRODUCT_FILTERS, dated: false },
    { id: 'inventory-movement', name: 'Inventory Movement', description: 'Ledger movements and their source documents.', permission: 'INVENTORY_ADJUSTMENT_VIEW',
      views: ['SUMMARY', 'DOCUMENT_DETAIL'], groupBy: ['location', 'movementType', 'product'], filters: ['sku', 'movementType'], dated: true },
    { id: 'inventory-aging', name: 'Inventory Aging', description: 'Current analytical age composition or a saved snapshot.', permission: 'INVENTORY_AGING_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL'], groupBy: ['location', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier'],
      filters: PRODUCT_FILTERS, dated: false, snapshot: true },
    { id: 'stock-replenishment', name: 'Stock Replenishment', description: 'Demand rate, stock coverage, lead time and suggested order.', permission: 'INVENTORY_ADJUSTMENT_VIEW',
      views: ['ITEM_DETAIL'], groupBy: [], filters: PRODUCT_FILTERS, dated: true, replenishment: true },
  ] },
  { name: 'Purchasing', reports: [
    { id: 'purchase-orders', name: 'Purchase Order Report', description: 'Ordered and received purchase lines.', permission: 'PURCHASE_ORDER_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'], groupBy: ['supplier', 'status', 'purchaseOrder', 'product'], filters: ['supplier', 'status', ...PRODUCT_FILTERS], dated: true },
    { id: 'grn-report', name: 'GRN Report', description: 'Posted goods receipt lines.', permission: 'GRN_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'], groupBy: ['supplier', 'location', 'grn', 'product'], filters: ['supplier', ...PRODUCT_FILTERS], dated: true },
    { id: 'supplier-purchases', name: 'Supplier Purchase Report', description: 'Received goods and values by supplier.', permission: 'GRN_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'], groupBy: ['supplier', 'product', 'grn'], filters: ['supplier', ...PRODUCT_FILTERS], dated: true },
  ] },
  { name: 'Returns & refunds', reports: [
    { id: 'refunds', name: 'Refund Analysis', description: 'Completed refund lines in their own business period.', permission: 'SALES_REFUND_VIEW',
      views: ['SUMMARY', 'ITEM_DETAIL', 'DOCUMENT_DETAIL'], groupBy: ['location', 'primarySupplier', 'product'], filters: [...PRODUCT_FILTERS, 'status'], dated: true },
  ] },
  { name: 'Cash & registers', reports: [
    { id: 'register-reconciliation', name: 'Register Reconciliation', description: 'Register and cashier sessions, payments and cash movements.', permission: 'SALES_REGISTER_CLOSE',
      views: ['SUMMARY', 'DOCUMENT_DETAIL'], groupBy: ['location', 'register', 'terminal', 'eventType'], filters: ['register', 'terminal', 'eventType', 'status'], dated: true },
  ] },
];

const OLD_REPORTS: Record<string, string> = {
  'gross-sales': 'sales-analysis', 'daily-sales': 'sales-analysis', 'product-sales': 'sales-analysis',
  'category-sales': 'sales-analysis', 'cashier-sales': 'sales-analysis', 'customer-sales': 'sales-analysis',
  'supplier-sales': 'sales-analysis', 'payment-methods': 'payment-analysis',
  'stock-on-hand': 'inventory-position', 'stock-valuation': 'inventory-position',
};
const SEARCHABLE = new Set(['sku', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier', 'supplier', 'customer', 'cashier']);

function display(value: ReportRow[string], field: string) {
  if (value === null || value === undefined || value === '') return '—';
  if (['reportDate', 'businessDate', 'weekStartDate', 'weekEndDate', 'rateFrom', 'rateTo'].includes(field)) return formatReportDate(value);
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) && !/Id$|Code$|Number$|Date$/.test(field)) {
    const [whole, fraction] = value.split('.');
    const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const significant = fraction?.replace(/0+$/, '');
    return significant ? `${grouped}.${significant}` : grouped;
  }
  return String(value);
}

export function ReportsAnalyticsPage() {
  const { permissions, accessScope, tenant } = useAuth();
  const [searchParams] = useSearchParams();
  const available = useMemo(() => REPORT_GROUPS.map(group => ({ ...group,
    reports: group.reports.filter(report => permissions.includes(report.permission)) })).filter(group => group.reports.length), [permissions]);
  const first = available[0]?.reports[0];
  const initialId = OLD_REPORTS[searchParams.get('report') ?? ''] ?? searchParams.get('report');
  const [reportId, setReportId] = useState(() => available.flatMap(group => group.reports).find(report => report.id === initialId)?.id ?? first?.id ?? '');
  const selected = available.flatMap(group => group.reports).find(report => report.id === reportId) ?? first;
  const activeReportId = selected?.id ?? '';
  const range = dashboardDateRange(new Date(), tenant?.timeZone ?? 'Asia/Colombo', 30);
  const [from, setFrom] = useState(searchParams.get('from') || range.from);
  const [to, setTo] = useState(searchParams.get('to') || range.to);
  const [locationId, setLocationId] = useState(searchParams.get('locationId') || '');
  const [view, setView] = useState<View>('SUMMARY');
  const [granularity, setGranularity] = useState<Granularity>(searchParams.get('report') === 'daily-sales' ? 'DAILY' : 'AGGREGATED');
  const oldGroup: Record<string, string> = { 'product-sales': 'product', 'category-sales': 'categoryLevel1',
    'cashier-sales': 'cashier', 'customer-sales': 'customer', 'supplier-sales': 'primarySupplier' };
  const [groupBy, setGroupBy] = useState(oldGroup[searchParams.get('report') ?? ''] ?? '');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [targetCoverageDays, setTargetCoverageDays] = useState('14');
  const [agingMode, setAgingMode] = useState<'CURRENT_LIVE' | 'STORED_SNAPSHOT'>('CURRENT_LIVE');
  const [snapshotDate, setSnapshotDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState('');
  const activeView = selected?.views.includes(view) ? view : selected?.views[0] ?? 'SUMMARY';
  const dimension = groupBy === '__all__' ? '' : groupBy && selected?.groupBy.includes(groupBy) ? groupBy : selected?.groupBy[0] ?? '';
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  const parameters = useMemo(() => new URLSearchParams({ from, to, ...(locationId ? { locationId } : {}),
    view: activeView, granularity, groupBy: activeView === 'SUMMARY' ? dimension : '',
    page: String(page), pageSize: String(pageSize),
    ...(selected?.replenishment ? { targetCoverageDays } : {}),
    ...(selected?.snapshot && agingMode === 'STORED_SNAPSHOT' && snapshotDate ? { snapshotDate } : {}),
    ...Object.fromEntries(activeFilters),
  }), [from, to, locationId, activeView, granularity, dimension, page, pageSize, selected?.replenishment, selected?.snapshot, targetCoverageDays, agingMode, snapshotDate, filters]);
  const valid = Boolean(activeReportId && from && to && from <= to && (!selected?.replenishment || /^\d+$/.test(targetCoverageDays))
    && (!selected.snapshot || agingMode === 'CURRENT_LIVE' || snapshotDate));
  const query = useQuery({ queryKey: ['report-v2', activeReportId, parameters.toString()],
    queryFn: () => apiClient.get<ReportResponse>(`/reports/${activeReportId}?${parameters}`), enabled: valid });
  const chartEnabled = valid && showAggregatedChart(activeReportId, activeView, granularity, dimension);
  const chartParams = useMemo(() => chartParameters(parameters), [parameters]);
  const chartQuery = useQuery({ queryKey: ['report-chart-v1', activeReportId, chartParams.toString()],
    queryFn: () => apiClient.get<ChartResponse>(`/reports/${activeReportId}?${chartParams}`), enabled: chartEnabled });
  const locations = useQuery({ queryKey: ['report-locations'],
    queryFn: () => apiClient.get<Array<{ locationId: number; code: string; name: string }>>('/reports/locations'), enabled: available.length > 0 });
  const rows = query.data?.rows ?? [];
  const columns = selected ? columnsFor(selected, activeView, granularity, dimension, rows) : [];
  const totalPages = Math.max(1, Math.ceil((query.data?.rowCount ?? 0) / pageSize));
  const chartRows = chartEnabled ? chartQuery.data?.rows ?? [] : [];
  const showChart = chartEnabled && chartRows.length >= 2;

  const choose = (id: string) => {
    const report = available.flatMap(group => group.reports).find(item => item.id === id);
    setReportId(id); setView(report?.views[0] ?? 'SUMMARY'); setGranularity('AGGREGATED');
    setGroupBy(''); setFilters({}); setPage(1); setExportError('');
  };
  const changeFilter = (field: string, value: string) => {
    setFilters(current => ({ ...current, [field]: value,
      ...(field === 'categoryLevel1' ? { categoryLevel2: '', categoryLevel3: '' } : {}),
      ...(field === 'categoryLevel2' ? { categoryLevel3: '' } : {}) }));
    setPage(1);
  };
  const reset = () => {
    const today = dashboardDateRange(new Date(), tenant?.timeZone ?? 'Asia/Colombo', 30);
    setFrom(today.from); setTo(today.to); setLocationId(''); setView(selected?.views[0] ?? 'SUMMARY');
    setGranularity('AGGREGATED'); setGroupBy(''); setFilters({}); setTargetCoverageDays('14');
    setAgingMode('CURRENT_LIVE'); setSnapshotDate(''); setPage(1); setExportError('');
  };
  const exportReport = async (format: 'csv' | 'pdf') => {
    if (!selected || !query.data?.rowCount || exporting) return;
    setExporting(format); setExportError('');
    try {
      const all = new URLSearchParams(parameters);
      all.set('all', '1'); all.set('page', '1');
      const result = await apiClient.get<ReportResponse>(`/reports/${activeReportId}?${all}`);
      const exportColumns = columnsFor(selected, activeView, granularity, dimension, result.rows);
      const headers = exportColumns.map(field => LABELS[field] ?? field);
      const values = result.rows.map(row => exportColumns.map(field => row[field]));
      const filename = `${selected.id}-${selected.dated ? `${from}-to-${to}` : 'current'}-${activeView.toLowerCase()}.${format}`;
      const blob = format === 'csv'
        ? new Blob([reportCsv(headers, values)], { type: 'text/csv;charset=utf-8' })
        : await reportPdf({ title: selected.name, headers,
          metadata: [`Tenant: ${tenant?.tenantName ?? ''}`,
            selected.replenishment ? `Rate horizon: ${from} to ${to} | Target coverage: ${targetCoverageDays} days`
              : selected.dated ? `Period: ${from} to ${to}` : selected.snapshot && agingMode === 'STORED_SNAPSHOT' ? `Stored snapshot: ${snapshotDate}` : 'Current position',
            `Location: ${locations.data?.find(location => String(location.locationId) === locationId)?.name ?? 'All accessible locations'}`,
            `View: ${activeView} | Time Granularity: ${activeView === 'DOCUMENT_DETAIL' || !selected.dated ? 'N/A' : granularity}`,
            `Group by: ${(LABELS[dimension] ?? dimension) || 'Overall'}`,
            ...activeFilters.map(([field, value]) => `${LABELS[field] ?? field}: ${value}`),
            `Generated: ${new Date().toLocaleString()}`],
          rows: result.rows.map(row => exportColumns.map(field => display(row[field], field))) });
      downloadFile(blob, filename);
    } catch (error) { setExportError(error instanceof Error ? error.message : 'Unable to export report.'); }
    finally { setExporting(null); }
  };

  return <div className="reports-page">
    <div className="page-head"><div><div className="eyebrow">INSIGHTS</div><h1>Reports &amp; Analytics</h1>
      <p>Choose a report, then refine its view and filters.</p></div></div>
    <div className="reports-layout">
      <aside className="reports-catalog card"><div className="reports-catalog-heading">REPORT LIBRARY</div>
        {available.map(group => <section className="reports-group" key={group.name}>
          <h2 className="reports-section-title">{group.name}</h2>
          {group.reports.map(report => <button type="button" key={report.id}
            className={`reports-link${report.id === selected?.id ? ' active' : ''}`}
            onClick={() => choose(report.id)}>{report.name}</button>)}
        </section>)}
      </aside>
      <section className="reports-workspace">{!selected ? <div className="card reports-empty">No reports are available for this role.</div> : <>
        <div className="page-head reports-report-heading"><div><h2>{selected.name}</h2><p>{selected.description}</p></div></div>
        <div className="card reports-filters reports-filter-panel">
          <div className="reports-filter-heading"><div><h3>Primary filters</h3><p>Set the scope and view.</p></div>
            <button type="button" className="btn" onClick={reset}>Reset filters</button></div>
          <div className="reports-filter-grid">
            {selected.dated && <label>{selected.replenishment ? 'Rate from' : 'From'}
              <input className="control" type="date" value={from} max={to} onChange={event => { setFrom(event.target.value); setPage(1); }} /></label>}
            {selected.dated && <label>{selected.replenishment ? 'Rate to' : 'To'}
              <input className="control" type="date" value={to} min={from} onChange={event => { setTo(event.target.value); setPage(1); }} /></label>}
            <SearchableSelect label="Location" value={locationId} onChange={value => { setLocationId(value); setPage(1); }}
              options={(locations.data ?? []).map(location => ({ value: String(location.locationId), label: location.name, code: location.code }))}
              placeholder="Search location" emptyMessage="No matching locations" clearLabel="All accessible locations" />
            {selected.views.length > 1 && <label>View<select className="control" value={activeView} onChange={event => { setView(event.target.value as View); setPage(1); }}>
              {selected.views.map(option => <option key={option} value={option}>{option.replace('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())}</option>)}
            </select></label>}
            {selected.dated && !selected.replenishment && activeView !== 'DOCUMENT_DETAIL' && <label>Time Granularity
              <select className="control" value={granularity} onChange={event => { setGranularity(event.target.value as Granularity); setPage(1); }}>
                {(['AGGREGATED', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Granularity[]).map(value => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}
              </select></label>}
            {activeView === 'SUMMARY' && selected.groupBy.length > 0 && <label>Group By
              <select className="control" value={groupBy === '__all__' ? '__all__' : dimension} onChange={event => { setGroupBy(event.target.value); setPage(1); }}>
                {selected.id !== 'payment-analysis' && <option value="__all__">Overall</option>}
                {selected.groupBy.map(value => <option key={value} value={value}>{LABELS[value] ?? value}</option>)}
              </select></label>}
            {selected.replenishment && <label>Target Coverage Days
              <input className="control" type="number" min="0" max="3650" value={targetCoverageDays} onChange={event => { setTargetCoverageDays(event.target.value); setPage(1); }} /></label>}
            {selected.snapshot && <label>Aging Source<select className="control" value={agingMode} onChange={event => { setAgingMode(event.target.value as typeof agingMode); setPage(1); }}>
              <option value="CURRENT_LIVE">Current / Live</option><option value="STORED_SNAPSHOT">Stored Snapshot</option>
            </select></label>}
            {selected.snapshot && agingMode === 'STORED_SNAPSHOT' && <label>Snapshot Date
              <input className="control" type="date" value={snapshotDate} onChange={event => { setSnapshotDate(event.target.value); setPage(1); }} /></label>}
          </div>
          {selected.filters.length > 0 && <details className="reports-more-filters">
            <summary>Refine results{activeFilters.length ? ` (${activeFilters.length} active)` : ''}</summary>
            <div className="reports-filter-grid">{selected.filters.map(field => {
              const options = query.data?.filterOptions?.[field] ?? [];
              return SEARCHABLE.has(field)
                ? <SearchableSelect key={field} label={field === 'sku' ? 'Product / SKU' : LABELS[field] ?? field}
                    value={filters[field] ?? ''} onChange={value => changeFilter(field, value)}
                    options={options} placeholder={field === 'sku' ? 'Search SKU / product name' : `Search ${LABELS[field] ?? field}`}
                    emptyMessage="No matching options" clearLabel="All" />
                : <label key={field}>{LABELS[field] ?? field}<select className="control" value={filters[field] ?? ''} onChange={event => changeFilter(field, event.target.value)}>
                    <option value="">All</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select></label>;
            })}</div>
          </details>}
          {activeFilters.length > 0 && <div className="reports-active-filters">{activeFilters.map(([field, value]) => <button key={field} type="button" onClick={() => changeFilter(field, '')}>
            {LABELS[field] ?? field}: {value} ×</button>)}</div>}
        </div>
        {selected.snapshot && agingMode === 'CURRENT_LIVE' && <p className="reports-scope-note">Current inventory aging is calculated from inventory history and may take longer for large datasets.</p>}
        {selected.replenishment && <p className="reports-scope-note">Demand rate uses all calendar days in the selected horizon. Stockout-day adjustment is not included.</p>}
        {exportError && <div className="error-box" role="alert">{exportError}</div>}
        {query.isError && <div className="error-box" role="alert">{query.error instanceof Error ? query.error.message : 'Unable to load report.'}</div>}
        {from > to && <div className="error-box">The start date must be on or before the end date.</div>}
        {activeView !== 'DOCUMENT_DETAIL' && rows.some(row => Number(row.cogsMissing ?? 0) > 0) && <div className="error-box" role="status">Some historical cost is unavailable; GP is not shown for affected groups.</div>}
        {chartQuery.isError && chartEnabled && <div className="error-box" role="alert">Unable to load performance breakdown.</div>}
        {showChart && <ReportChart reportId={selected.id} rows={chartRows} dimension={dimension} granularity={granularity} serverRankedTopN />}
        <div className="card reports-results">
          <div className="toolbar"><div className="reports-result-heading"><strong>{activeView.replace('_', ' ')}</strong>
            <span>{query.data?.rowCount ?? 0} matching rows</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" disabled={!query.data?.rowCount || !!exporting} onClick={() => void exportReport('csv')}>Export CSV</button>
              <button type="button" className="btn" disabled={!query.data?.rowCount || !!exporting} onClick={() => void exportReport('pdf')}>Export PDF</button>
            </div></div>
          {query.isLoading || query.isFetching ? <div className="reports-empty">Loading report…</div>
            : rows.length === 0 ? <div className="reports-empty">No records found for these filters.</div>
            : <div className="table-wrap"><table className="table"><thead><tr>{columns.map(column => <th key={column}>{LABELS[column] ?? column}</th>)}</tr></thead>
              <tbody>{rows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column}>{display(row[column], column)}</td>)}</tr>)}</tbody></table></div>}
          <div className="toolbar sales-history-pagination"><span>{query.data?.rowCount ? `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, query.data.rowCount)} of ${query.data.rowCount}` : '0 records'}</span>
            <nav className="sales-history-page-controls" aria-label="Report pagination">
              <button type="button" className="btn btn-secondary" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button type="button" className="btn btn-secondary" disabled={page >= totalPages || query.isFetching} onClick={() => setPage(page + 1)}>Next</button>
              <select className="control" aria-label="Rows per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>
                <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
              </select>
            </nav></div>
        </div>
      </>}</section>
    </div>
    {accessScope === 'LOCATION' && <p className="reports-scope-note">Results are limited to your assigned locations.</p>}
  </div>;
}
