export type RetailDiscount = { type: 'PERCENTAGE' | 'AMOUNT'; value: number };
export function linkedRetailDiscount(gross: number, discount: RetailDiscount) {
  const total = Math.round((Math.max(0, Number.isFinite(gross) ? gross : 0) + Number.EPSILON) * 100) / 100;
  const value = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);
  const retailDiscount: RetailDiscount = { type: discount.type, value: Math.min(discount.type === 'PERCENTAGE' ? 100 : total, value) };
  const amount = retailDiscount.type === 'PERCENTAGE' ? total * retailDiscount.value / 100 : retailDiscount.value;
  const discountRs = Math.round((amount + Number.EPSILON) * 100) / 100;
  if (retailDiscount.type === 'AMOUNT') retailDiscount.value = discountRs;
  const discountPct = retailDiscount.type === 'PERCENTAGE' ? retailDiscount.value : total ? Number((discountRs / total * 100).toFixed(2)) : 0;
  return { discountPct, discountRs, retailDiscount };
}

type Cell = { row: number; column: number };
export function cartFocusTarget(cells: Cell[], current: Cell, key: string): Cell | undefined {
  const index = cells.findIndex(cell => cell.row === current.row && cell.column === current.column);
  if (index < 0) return undefined;
  if (key === 'ArrowRight' || key === 'Enter') return cells[Math.min(index + 1, cells.length - 1)];
  if (key === 'ArrowLeft') return cells[Math.max(0, index - 1)];
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const rowNumbers = [...new Set(cells.map(cell => cell.row))].sort((a, b) => a - b);
    const rowIndex = rowNumbers.indexOf(current.row);
    const nextRow = rowNumbers[Math.max(0, Math.min(rowNumbers.length - 1, rowIndex + (key === 'ArrowUp' ? -1 : 1)))];
    return cells.find(cell => cell.row === nextRow && cell.column === current.column) ?? cells.find(cell => cell.row === nextRow);
  }
  return undefined;
}

export function cartLineGross(quantity: number, unitPrice: number, quote?: { quantity: number; grossTotal: number; pricingUnitPrice?: number }) {
  if (quote && Number(quote.quantity) === quantity) return Number(quote.grossTotal);
  return Math.round((quantity * (quote?.pricingUnitPrice ?? unitPrice) + Number.EPSILON) * 100) / 100;
}
