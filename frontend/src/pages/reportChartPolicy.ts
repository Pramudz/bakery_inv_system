const CHART_REPORTS = new Set([
  'sales-analysis', 'credit-sales', 'payment-analysis', 'inventory-movement',
  'purchase-orders', 'grn-report', 'supplier-purchases', 'refunds', 'register-reconciliation',
]);

export function showAggregatedChart(reportId: string, view: string, granularity: string, groupBy: string) {
  return CHART_REPORTS.has(reportId) && view === 'SUMMARY' && granularity === 'AGGREGATED' && !!groupBy;
}

export function chartParameters(tableParameters: URLSearchParams) {
  const parameters = new URLSearchParams(tableParameters);
  parameters.delete('page');
  parameters.delete('pageSize');
  parameters.delete('all');
  parameters.set('chart', '1');
  return parameters;
}
