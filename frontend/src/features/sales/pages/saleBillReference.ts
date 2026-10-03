export type SaleBillIdentity = { businessDate?: string | null; printedLocationCode?: string | null; printedRegisterCode?: string | null; billNo?: number | null };

export function saleBillReference(sale: SaleBillIdentity | null | undefined) {
  if (!sale || sale.billNo == null || !sale.businessDate || !sale.printedLocationCode || !sale.printedRegisterCode) return 'Legacy sale';
  const date = sale.businessDate.slice(0, 10).split('-').reverse().join('/');
  return `${date} / ${sale.printedLocationCode} / ${sale.printedRegisterCode} / ${String(sale.billNo).padStart(4, '0')}`;
}
