import type { ReportRow } from './reportData';

export type ReportView = 'SUMMARY' | 'ITEM_DETAIL' | 'DOCUMENT_DETAIL';
export type ReportGranularity = 'AGGREGATED' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
export type ColumnReportDefinition = { id: string; dated: boolean; replenishment?: boolean };

// Screen, CSV and PDF all select fields from the same normalized result in this order.
export const ITEM_DIMENSIONS = ['sku', 'product', 'brand', 'primarySupplier',
  'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'location'] as const;

export function columnsFor(report: ColumnReportDefinition, view: ReportView,
  granularity: ReportGranularity, groupBy: string, rows: ReportRow[]) {
  const period = granularity === 'AGGREGATED' || view === 'DOCUMENT_DETAIL' || !report.dated || report.replenishment
    ? [] : ['periodKey'];
  const sales = ['qty', 'refundQty', 'netQty', 'grossSales', 'discount', 'netSalesBeforeRefund',
    'refundValue', 'netSales', 'saleCogs', 'cogsReversal', 'cogs', 'gp', 'gpPercent'];
  let fields: string[];
  if (['sales-analysis', 'credit-sales'].includes(report.id)) fields = view === 'DOCUMENT_DETAIL'
    ? ['reportDate', 'eventType', 'invoice', 'refund', 'printedLocationCode', 'printedRegisterCode',
      'billNo', 'location', 'terminal', 'register', 'cashier', 'customer', 'sku', 'product', ...sales]
    : view === 'ITEM_DETAIL' ? [...period, ...ITEM_DIMENSIONS, ...sales, 'billCount']
      : [...period, ...(groupBy === 'product' ? ['sku', 'product'] : groupBy ? [groupBy] : []), ...sales, 'billCount'];
  else if (report.id === 'payment-analysis') fields = view === 'DOCUMENT_DETAIL'
    ? ['reportDate', 'invoice', 'location', 'customer', 'cashier', 'terminal', 'register',
      'paymentMethod', 'channel', 'externalReference', 'paymentValue']
    : [...period, ...(groupBy !== 'paymentMethod' && groupBy !== 'channel' ? [groupBy] : []),
      'paymentMethod', ...(groupBy === 'channel' ? ['channelCode', 'channel'] : []), 'paymentValue', 'paymentCount'];
  else if (report.id === 'inventory-position') fields = view === 'ITEM_DETAIL'
    ? [...ITEM_DIMENSIONS, 'qty', 'unitCost', 'stockValue', 'incomingTransitQty', 'incomingTransitValue',
      'outgoingTransitQty', 'outgoingTransitValue', 'companyOwnedValue']
    : [groupBy, 'qty', 'stockValue', 'incomingTransitQty', 'incomingTransitValue',
      'outgoingTransitQty', 'outgoingTransitValue', 'companyOwnedValue'];
  else if (report.id === 'inventory-aging') fields = view === 'ITEM_DETAIL'
    ? [...ITEM_DIMENSIONS, 'qty', 'unitCost', 'stockValue', 'qty0to30', 'qty31to60', 'qty61to90',
      'qty91to180', 'qty181to365', 'qty365plus', 'unknownQty', 'attributedQty',
      'agingCoveragePercentage', 'averageAgeDays', 'oldestAgeDays']
    : [groupBy, 'qty', 'stockValue', 'qty0to30', 'qty31to60', 'qty61to90', 'qty91to180',
      'qty181to365', 'qty365plus', 'unknownQty', 'attributedQty', 'agingCoveragePercentage',
      'averageAgeDays', 'oldestAgeDays'];
  else if (report.id === 'stock-replenishment') fields = ['rateFrom', 'rateTo', ...ITEM_DIMENSIONS,
    'qty', 'unitCost', 'stockValue', 'openPoBaseQty', 'incomingTransferQty', 'inventoryPositionQty',
    'consumptionQty', 'rateHorizonDays', 'perDayRate', 'leadTimeDays', 'leadTimeSource',
    'leadTimeDemand', 'daysOfSupply', 'weeksOfSupply', 'targetCoverageDays', 'targetStock',
    'reorderStatus', 'suggestedBaseQty', 'suggestedPurchaseUnit', 'suggestedPurchaseQty',
    'suggestedConvertedBaseQty'];
  else if (view === 'ITEM_DETAIL') fields = [...period, ...ITEM_DIMENSIONS,
    ...(['purchase-orders', 'grn-report', 'supplier-purchases'].includes(report.id) ? ['supplier'] : []),
    ...(['purchase-orders'].includes(report.id) ? ['qty', 'receivedQty', 'lineValue']
      : ['grn-report', 'supplier-purchases'].includes(report.id) ? ['qty', 'lineValue']
        : report.id === 'refunds' ? ['qty', 'refundValue'] : [])];
  else fields = view === 'SUMMARY' ? [...period,
    ...(groupBy === 'product' ? ['sku', 'product'] : groupBy ? [groupBy] : []),
    ...Object.keys(rows[0] ?? {}).filter(field => /^(qty|qtyIn|qtyOut|receivedQty|lineValue|refundValue|paymentValue|cashMovementValue|cashierSessionCount|openingBalance|expectedCash|countedCash|variance)$/.test(field))]
    : Object.keys(rows[0] ?? {}).filter(field => !/Id$/.test(field));
  return [...new Set(fields.filter(Boolean))].filter(field => rows.some(row => field in row));
}
