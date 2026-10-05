import type { ReportRow } from './reportData';

const sum = (rows: ReportRow[], field: string) => rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
export function dashboardTotals(sales: ReportRow[], stock: ReportRow[]) {
  return {
    netSales: sum(sales, 'netSales'),
    grossProfit: sum(sales, 'gp'),
    invoices: new Set(sales.filter(row => row.invoice != null).map(row => JSON.stringify([row.location, row.invoice]))).size,
    stockValue: sum(stock, 'stockValue'),
  };
}

export function dashboardDateRange(now: Date, timeZone: string, days: number) {
  let parts: Intl.DateTimeFormatPart[];
  try { parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); }
  catch { parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now); }
  const part = (name: string) => Number(parts.find(item => item.type === name)?.value);
  const end = new Date(Date.UTC(part('year'), part('month') - 1, part('day')));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

export function dailySalesSeries(rows: ReportRow[], from: string, to: string): ReportRow[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const date = String(row.reportDate).slice(0, 10);
    totals.set(date, (totals.get(date) ?? 0) + (Number(row.netSales) || 0));
  }
  const series: ReportRow[] = [];
  const date = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    const key = date.toISOString().slice(0, 10);
    series.push({ reportDate: key, netSales: totals.get(key) ?? 0 });
  }
  return series;
}
