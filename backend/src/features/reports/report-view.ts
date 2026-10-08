import { checked, units } from '../../common/inventory-decimal';
import { reportPeriod, TimeGranularity } from './report-period';
import { percent4 } from './sales-report';

export type ReportView = 'SUMMARY' | 'ITEM_DETAIL' | 'DOCUMENT_DETAIL';
export type ReportValue = string | number | boolean | null | undefined;
export type ReportDataRow = Record<string, ReportValue>;

export const REPORT_FILTER_FIELDS = [
  'sku', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier',
  'supplier', 'customer', 'cashier', 'paymentMethod', 'channel', 'status', 'movementType',
  'register', 'terminal', 'eventType', 'reorderStatus',
] as const;

const SALES_MEASURES = ['qty', 'refundQty', 'grossSales', 'discount', 'netSalesBeforeRefund',
  'refundValue', 'netSales', 'saleCogs', 'cogsReversal', 'cogs', 'gp', 'netQty'] as const;
const PAYMENT_MEASURES = ['paymentValue', 'paymentCount'] as const;
const POSITION_MEASURES = ['qty', 'stockValue', 'incomingTransitQty', 'incomingTransitValue',
  'outgoingTransitQty', 'outgoingTransitValue', 'companyOwnedValue'] as const;
const AGING_MEASURES = ['qty', 'stockValue', 'qty0to30', 'qty31to60', 'qty61to90', 'qty91to180',
  'qty181to365', 'qty365plus', 'unknownQty', 'attributedQty'] as const;
const OTHER_MEASURES: Record<string, readonly string[]> = {
  'inventory-movement': ['qtyIn', 'qtyOut', 'movementValue'],
  'purchase-orders': ['qty', 'receivedQty', 'lineValue'],
  'grn-report': ['qty', 'lineValue'], 'supplier-purchases': ['qty', 'lineValue'],
  refunds: ['qty', 'refundValue'],
  'register-reconciliation': ['openingBalance', 'cashierSessionCount', 'paymentValue', 'cashMovementValue', 'expectedCash', 'countedCash', 'variance'],
};

export function reportFilterOptions(rows: ReportDataRow[], fields: readonly string[], active: Record<string, string | undefined> = {}) {
  const result: Record<string, Array<{ value: string; label: string }>> = {};
  for (const field of fields) {
    const choices = new Map<string, string>();
    for (const row of rows) {
      if (field === 'categoryLevel2' && active.categoryLevel1 && row.categoryLevel1 !== active.categoryLevel1) continue;
      if (field === 'categoryLevel3' && ((active.categoryLevel1 && row.categoryLevel1 !== active.categoryLevel1)
        || (active.categoryLevel2 && row.categoryLevel2 !== active.categoryLevel2))) continue;
      const value = String(row[field] ?? '');
      if (!value) continue;
      choices.set(value, field === 'sku' ? `${value} — ${row.product ?? 'Product'}` : value);
    }
    result[field] = [...choices].sort(([a], [b]) => a.localeCompare(b)).map(([value, label]) => ({ value, label }));
  }
  return result;
}

export function applyReportFilters(rows: ReportDataRow[], filters: Record<string, string | undefined>) {
  return rows.filter(row => REPORT_FILTER_FIELDS.every(field => !filters[field] || String(row[field] ?? '') === filters[field]));
}

function measures(reportId: string): readonly string[] {
  if (['sales-analysis', 'credit-sales'].includes(reportId)) return SALES_MEASURES;
  if (reportId === 'payment-analysis') return PAYMENT_MEASURES;
  if (reportId === 'inventory-position') return POSITION_MEASURES;
  if (reportId === 'inventory-aging') return AGING_MEASURES;
  return OTHER_MEASURES[reportId] ?? [];
}

function periodForRow(row: ReportDataRow, granularity: TimeGranularity) {
  const day = String(row.reportDate ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? reportPeriod(day, granularity) : { periodKey: 'ALL' };
}

function aggregateRows(rows: ReportDataRow[], reportId: string, view: ReportView,
  granularity: TimeGranularity, groupBy: string) {
  if (view === 'DOCUMENT_DETAIL' || (view === 'ITEM_DETAIL' &&
    ['stock-replenishment', 'inventory-position', 'inventory-aging'].includes(reportId))) return rows;
  const fields = measures(reportId);
  const grouped = new Map<string, { row: ReportDataRow; totals: Map<string, bigint>; invoices: Set<string>; missing: boolean;
    weightedAge: bigint; oldestAge: number | null }>();
  for (const source of rows) {
    const period = periodForRow(source, granularity);
    const periodKey = 'reportDate' in source ? period.periodKey : 'ALL';
    const dimension = view === 'ITEM_DETAIL' ? String(source.sku ?? source.productId ?? '')
      : groupBy === 'product' ? String(source.productId ?? source.sku ?? source.product ?? 'Unknown')
        : String(source[groupBy] ?? 'All');
    const location = view === 'ITEM_DETAIL' ? String(source.locationId ?? source.location ?? '') : '';
    const supplier = view === 'ITEM_DETAIL' && ['purchase-orders', 'grn-report', 'supplier-purchases'].includes(reportId)
      ? String(source.supplier ?? '') : '';
    const group = reportId === 'payment-analysis' && view === 'SUMMARY'
      ? `${source.paymentMethod ?? 'Unclassified'}:${groupBy === 'channel' ? source.channelId ?? source.channel ?? ''
        : groupBy === 'paymentMethod' ? '' : dimension}` : dimension;
    const groupingKey = JSON.stringify([periodKey, location, supplier, group,
      view === 'ITEM_DETAIL' ? String(source.productId ?? source.product ?? '') : '']);
    let state = grouped.get(groupingKey);
    if (!state) {
      const row: ReportDataRow = view === 'ITEM_DETAIL'
        ? Object.fromEntries(['location', 'locationId', 'sku', 'product', 'productId', 'brand', 'primarySupplier',
          'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'supplier'].filter(field => field in source).map(field => [field, source[field]]))
        : reportId === 'payment-analysis' ? { paymentMethod: source.paymentMethod ?? null,
          ...(groupBy !== 'paymentMethod' && groupBy !== 'channel' ? { [groupBy]: source[groupBy] ?? null } : {}),
          ...(groupBy === 'channel' ? { channelId: source.channelId ?? null, channelCode: source.channelCode ?? null,
            channel: source.channel ?? null } : {}) }
        : groupBy === 'product' ? { productId: source.productId ?? null,
          sku: source.sku ?? null, product: source.product ?? null }
          : groupBy ? { [groupBy]: source[groupBy] ?? null } : {};
      if ('reportDate' in source && granularity !== 'AGGREGATED') Object.assign(row, period);
      state = { row, totals: new Map(), invoices: new Set(), missing: false, weightedAge: 0n, oldestAge: null };
      grouped.set(groupingKey, state);
    }
    for (const field of fields) {
      if (!(field in source)) continue;
      if (source[field] === null) { if (field === 'cogs' || field === 'gp') state.missing = true; continue; }
      state.totals.set(field, (state.totals.get(field) ?? 0n) + units(String(source[field] ?? '0')));
    }
    if (reportId === 'inventory-aging' && source.averageAgeDays != null && source.attributedQty != null)
      state.weightedAge += units(String(source.averageAgeDays)) * units(String(source.attributedQty));
    if (reportId === 'inventory-aging' && source.oldestAgeDays != null)
      state.oldestAge = Math.max(state.oldestAge ?? 0, Number(source.oldestAgeDays));
    if (source.eventType === 'SALE' && source.invoice != null)
      state.invoices.add(JSON.stringify([source.locationId ?? source.location ?? null, source.invoice]));
    if (Number(source.cogsMissing ?? 0) > 0) state.missing = true;
  }
  return [...grouped.values()].map(({ row, totals, invoices, missing, weightedAge, oldestAge }) => {
    for (const [field, value] of totals) row[field] = checked(value);
    if (reportId === 'sales-analysis' || reportId === 'credit-sales') {
      row.billCount = invoices.size;
      row.cogsMissing = missing ? 1 : 0;
      if (missing) { row.cogs = null; row.gp = null; row.gpPercent = null; }
      else {
        const net = totals.get('netSales') ?? 0n;
        const gp = totals.get('gp') ?? 0n;
        row.gpPercent = percent4(gp, net);
      }
    }
    if (reportId === 'inventory-aging') {
      const attributed = totals.get('attributedQty') ?? 0n, qoh = totals.get('qty') ?? 0n;
      row.agingCoveragePercentage = qoh === 0n ? '0.0000' : checked((attributed * 1_000_000n + qoh / 2n) / qoh);
      row.averageAgeDays = attributed === 0n ? null : checked((weightedAge + attributed / 2n) / attributed);
      row.oldestAgeDays = oldestAge;
    }
    return row;
  });
}

export function materializeReport(rows: ReportDataRow[], reportId: string, view: ReportView,
  granularity: TimeGranularity, groupBy: string, filters: Record<string, string | undefined>,
  page: number, pageSize: number, all = false) {
  const filterOptions = reportFilterOptions(rows, REPORT_FILTER_FIELDS, filters);
  const filtered = applyReportFilters(rows, filters);
  const grouped = aggregateRows(filtered, reportId, view, granularity, groupBy);
  const rowCount = grouped.length;
  const start = Math.max(0, (page - 1) * pageSize);
  return { rows: all ? grouped : grouped.slice(start, start + pageSize), rowCount, page, pageSize,
    filterOptions };
}
