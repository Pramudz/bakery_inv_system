import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { UseQueryResult } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { apiClient } from '../services/apiClient';
import { ReportChart } from './ReportChart';
import { groupRows } from './reportData';
import type { ReportRow } from './reportData';
import { dashboardTotals, dashboardDateRange, dailySalesSeries } from './dashboardData';
import { PlatformDashboard } from './PlatformDashboard';

type Report = { rows: ReportRow[] };
type Filters = { from: string; to: string; locationId: string; tenantId: string };
function useDashboardReport(id: string, allowed: boolean, filters: Filters, snapshot = false) {
  const { from, to, locationId, tenantId } = filters;
  return useQuery({
    queryKey: ['dashboard-report', tenantId, id, snapshot ? 'current' : from, snapshot ? 'current' : to, locationId],
    queryFn: () => apiClient.get<Report>(`/reports/${id}?${new URLSearchParams({ ...(snapshot ? {} : { from, to }), ...(locationId ? { locationId } : {}) })}`),
    enabled: allowed && (snapshot || Boolean(from && to && from <= to)),
  });
}

function DashboardChartCard({ title, description, href, query, children, hasData }: {
  title: string; description: string; href: string; query: UseQueryResult<Report, Error>; children: ReactNode; hasData: boolean;
}) {
  return <section className="card dashboard-chart-card">
    <div className="dashboard-chart-heading"><div><h2>{title}</h2><p>{description}</p></div><Link to={href}>View report <span aria-hidden="true">&#8599;</span></Link></div>
    {query.isPending ? <div className="dashboard-chart-state" role="status"><div className="dashboard-skeleton" /><div className="dashboard-skeleton" /><span>Loading report data...</span></div>
      : query.isError ? <div className="dashboard-chart-state" role="alert"><strong>Unable to load this report</strong><p>{query.error.message}</p><button type="button" className="btn btn-secondary" onClick={() => void query.refetch()}>Try again</button></div>
      : !hasData ? <div className="dashboard-chart-state"><span className="dashboard-empty-mark" aria-hidden="true">&#8212;</span><strong>No activity to display</strong><p>No values were found for this selection.</p></div>
      : children}
  </section>;
}

function TenantDashboard() {
  const { tenant, permissions, accessScope } = useAuth();
  const timeZone = tenant?.timeZone || 'Asia/Colombo';
  const [range, setRange] = useState(() => dashboardDateRange(new Date(), timeZone, 30));
  const [preset, setPreset] = useState('30');
  const [locationId, setLocationId] = useState('');
  const canSales = permissions.includes('SALES_INVOICE_VIEW');
  const canInventory = permissions.includes('INVENTORY_ADJUSTMENT_VIEW');
  const canView = canSales || canInventory;
  const validRange = Boolean(range.from && range.to && range.from <= range.to);
  const filters = { ...range, locationId, tenantId: tenant?.tenantId ?? '' };
  const sales = useDashboardReport('gross-sales', canSales, filters);
  const payments = useDashboardReport('payment-methods', canSales, filters);
  const stock = useDashboardReport('stock-valuation', canInventory, filters, true);
  const aging = useDashboardReport('inventory-aging', canInventory, filters, true);
  const locations = useQuery({
    queryKey: ['dashboard-locations', tenant?.tenantId],
    queryFn: () => apiClient.get<Array<{ locationId: number; name: string }>>('/reports/locations'),
    enabled: canView,
  });
  const salesRows = sales.data?.rows ?? [];
  const totals = dashboardTotals(salesRows, stock.data?.rows ?? []);
  const dailyRows = useMemo(() => dailySalesSeries(sales.data?.rows ?? [], range.from, range.to), [sales.data, range.from, range.to]);
  const products = groupRows(salesRows, 'product', 'DAY');
  const paymentRows = groupRows(payments.data?.rows ?? [], 'paymentMethod', 'DAY');
  const ageRows = groupRows(aging.data?.rows ?? [], 'agingBucket', 'DAY');
  const hasValues = (rows: ReportRow[], field: string) => rows.some(row => Number(row[field]) !== 0);
  const money = (value: number) => `LKR ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const href = (report: string) => `/reports-analytics?${new URLSearchParams({ report, ...range, ...(locationId ? { locationId } : {}) })}`;
  const metricValue = (query: UseQueryResult<Report, Error>, value: string) => query.isError ? 'Unavailable' : query.isPending ? 'Loading...' : value;
  const refresh = () => { if (canSales && validRange) { void sales.refetch(); void payments.refetch(); } if (canInventory) { void stock.refetch(); void aging.refetch(); } };
  const updating = [sales, payments, stock, aging].some(query => query.isFetching);
  const latest = Math.max(sales.dataUpdatedAt, payments.dataUpdatedAt, stock.dataUpdatedAt, aging.dataUpdatedAt);

  return <div className="tenant-dashboard">
    <div className="page-head dashboard-page-heading">
      <div><div className="eyebrow">BUSINESS OVERVIEW</div><h1>Tenant Dashboard</h1><p>Performance and stock insights for <strong>{tenant?.tenantName ?? 'your business'}</strong>.</p></div>
      {canView && <div className="dashboard-heading-actions"><Link className="btn btn-secondary" to={href(canSales ? 'gross-sales' : 'stock-valuation')}>Reports &amp; Analytics</Link><button type="button" className="btn btn-primary" disabled={updating || (!validRange && !canInventory)} onClick={refresh}>{updating ? 'Updating...' : 'Refresh data'}</button></div>}
    </div>
    {!canView ? <div className="card dashboard-chart-state"><strong>Your workspace is ready</strong><p>Your role does not have access to sales or inventory reports. Contact your administrator to enable dashboard insights.</p></div> : <>
      <div className="card dashboard-filters">
        <label>Period<select className="control" value={preset} onChange={event => { const value = event.target.value; setPreset(value); if (value !== 'custom') setRange(dashboardDateRange(new Date(), timeZone, Number(value))); }}><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option></select></label>
        <label>From<input className="control" type="date" max={range.to} value={range.from} onChange={event => { setPreset('custom'); setRange(current => ({ ...current, from: event.target.value })); }} /></label>
        <label>To<input className="control" type="date" min={range.from} value={range.to} onChange={event => { setPreset('custom'); setRange(current => ({ ...current, to: event.target.value })); }} /></label>
        <label>Location<select className="control" value={locationId} disabled={locations.isPending || locations.isError} onChange={event => setLocationId(event.target.value)}><option value="">All accessible locations</option>{(locations.data ?? []).map(location => <option key={location.locationId} value={location.locationId}>{location.name}</option>)}</select></label>
        <div className="dashboard-filters-note"><span className="dashboard-status-dot" />{updating ? 'Updating insights' : latest ? `Updated ${new Date(latest).toLocaleTimeString('en-LK', { timeZone, hour: '2-digit', minute: '2-digit' })}` : 'Report insights'}</div>
      </div>
      {!validRange && <div className="error-box" role="alert">Select a valid date range with the start date on or before the end date.</div>}
      {locations.isError && <div className="error-box" role="alert">Unable to load locations. <button className="btn btn-secondary" type="button" onClick={() => void locations.refetch()}>Try again</button></div>}
      <div className="dashboard-metrics">
        {canSales && <>
          <Link className="card dashboard-metric metric-sales" to={href('gross-sales')}><span className="dashboard-metric-label">Net sales <span aria-hidden="true">&#8599;</span></span><strong>{metricValue(sales, money(totals.netSales))}</strong><small>Sales after discounts in selected period</small></Link>
          <Link className="card dashboard-metric metric-profit" to={href('gross-sales')}><span className="dashboard-metric-label">Gross profit <span aria-hidden="true">&#8599;</span></span><strong>{metricValue(sales, money(totals.grossProfit))}</strong><small>Net sales less recorded cost of goods</small></Link>
          <Link className="card dashboard-metric metric-invoices" to={href('daily-sales')}><span className="dashboard-metric-label">Invoices <span aria-hidden="true">&#8599;</span></span><strong>{metricValue(sales, totals.invoices.toLocaleString())}</strong><small>Distinct invoices in selected period</small></Link>
        </>}
        {canInventory && <Link className="card dashboard-metric metric-stock" to={href('stock-valuation')}><span className="dashboard-metric-label">Stock value <span aria-hidden="true">&#8599;</span></span><strong>{metricValue(stock, money(totals.stockValue))}</strong><small>Current stock snapshot at average cost</small></Link>}
      </div>
      <div className="dashboard-charts-grid">
        {canSales && <>
          <DashboardChartCard title="Daily sales trend" description="Net sales over the selected period" href={href('daily-sales')} query={sales} hasData={hasValues(dailyRows, 'netSales')}><ReportChart reportId="daily-sales" rows={dailyRows} dimension="reportDate" granularity="DAY" hideHeading /></DashboardChartCard>
          <DashboardChartCard title="Best-selling products" description="Top products ranked by net sales" href={href('product-sales')} query={sales} hasData={hasValues(products, 'netSales')}><ReportChart reportId="product-sales" rows={products} dimension="product" granularity="DAY" hideHeading /></DashboardChartCard>
          <DashboardChartCard title="Payment breakdown" description="Payment value by method in selected period" href={href('payment-methods')} query={payments} hasData={hasValues(paymentRows, 'paymentValue')}><ReportChart reportId="payment-methods" rows={paymentRows} dimension="paymentMethod" granularity="DAY" hideHeading /></DashboardChartCard>
        </>}
        {canInventory && <DashboardChartCard title="Inventory aging" description="Current remaining stock value by age" href={href('inventory-aging')} query={aging} hasData={hasValues(ageRows, 'stockValue')}><ReportChart reportId="inventory-aging" rows={ageRows} dimension="agingBucket" granularity="DAY" hideHeading /></DashboardChartCard>}
      </div>
      <p className="dashboard-scope-note">{accessScope === 'LOCATION' ? 'Insights are limited to your assigned locations. ' : ''}Sales and payments follow the selected period. Inventory shows the current stock snapshot.</p>
    </>}
  </div>;
}

export function DashboardPage() {
  const { scope } = useAuth();
  return scope === 'TENANT' ? <TenantDashboard /> : <PlatformDashboard />;
}
