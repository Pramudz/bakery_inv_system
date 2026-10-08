import { BadRequestException } from '@nestjs/common';
import { REPORT_FILTER_FIELDS } from './report-view';

const PRODUCT_FILTERS = ['sku', 'categoryLevel1', 'categoryLevel2', 'categoryLevel3', 'brand', 'primarySupplier'];
const CHART_REPORTS: Record<string, { metric: string; expression: string; filters: string[] }> = {
  'sales-analysis': { metric: 'netSales', expression: 'SUM(src.grossSales - src.discount - src.refundValue)', filters: [...PRODUCT_FILTERS, 'cashier', 'customer', 'eventType'] },
  'credit-sales': { metric: 'netSales', expression: 'SUM(src.grossSales - src.discount - src.refundValue)', filters: [...PRODUCT_FILTERS, 'cashier', 'customer', 'eventType'] },
  'payment-analysis': { metric: 'paymentValue', expression: 'SUM(src.paymentValue)', filters: ['paymentMethod', 'channel', 'cashier', 'customer', 'terminal', 'register'] },
  'inventory-movement': { metric: 'qtyIn', expression: 'SUM(src.qtyIn)', filters: ['sku', 'movementType'] },
  'purchase-orders': { metric: 'qty', expression: 'SUM(src.qty)', filters: ['supplier', 'status', ...PRODUCT_FILTERS] },
  'grn-report': { metric: 'lineValue', expression: 'SUM(src.lineValue)', filters: ['supplier', ...PRODUCT_FILTERS] },
  'supplier-purchases': { metric: 'lineValue', expression: 'SUM(src.lineValue)', filters: ['supplier', ...PRODUCT_FILTERS] },
  refunds: { metric: 'refundValue', expression: 'SUM(src.refundValue)', filters: [...PRODUCT_FILTERS, 'status'] },
  'register-reconciliation': { metric: 'expectedCash', expression: 'SUM(src.expectedCash)', filters: ['register', 'terminal', 'eventType', 'status'] },
};

export function chartSupported(reportId: string) { return reportId in CHART_REPORTS; }

export function chartQuery(reportId: string, sourceSql: string, groupBy: string, filters: Record<string, string | undefined>,
  params: Array<string | number | Date>, supportedGroups: readonly string[]) {
  const definition = CHART_REPORTS[reportId];
  if (!definition || !supportedGroups.includes(groupBy)) throw new BadRequestException('Unsupported chart grouping.');
  const orderIndex = sourceSql.lastIndexOf('\n  ORDER BY ');
  if (orderIndex < 0) throw new Error('Report source query has no final ordering.');
  const source = sourceSql.slice(0, orderIndex);
  const where: string[] = [];
  const queryParams = [...params];
  for (const field of REPORT_FILTER_FIELDS) {
    const value = filters[field];
    if (!value) continue;
    if (!definition.filters.includes(field)) { where.push('1 = 0'); continue; }
    where.push(`CAST(src.\`${field}\` AS CHAR) = ?`);
    queryParams.push(value);
  }
  const product = groupBy === 'product';
  const payment = reportId === 'payment-analysis';
  const identity = product ? 'src.productId' : groupBy === 'channel' && payment ? 'src.channelId' : `src.\`${groupBy}\``;
  const group = payment && groupBy !== 'paymentMethod' ? `src.paymentMethod, ${identity}` : identity;
  const labels = product ? 'MIN(src.sku) AS sku, MIN(src.product) AS product, MIN(src.productId) AS productId'
    : payment && groupBy === 'channel'
      ? 'src.paymentMethod AS paymentMethod, MIN(src.channel) AS channel, src.channelId AS channelId'
      : payment && groupBy !== 'paymentMethod'
        ? `src.paymentMethod AS paymentMethod, src.\`${groupBy}\` AS \`${groupBy}\``
        : `src.\`${groupBy}\` AS \`${groupBy}\``;
  const sql = `SELECT ${labels}, ${definition.expression} AS \`${definition.metric}\`
    FROM (${source}) src
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    GROUP BY ${group}
    ORDER BY \`${definition.metric}\` DESC, ${group} ASC
    LIMIT 10`;
  return { sql, params: queryParams, metric: definition.metric };
}
