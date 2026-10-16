import { BadRequestException } from '@nestjs/common';
import type { PosPriceLine, PosSaleType } from './pos-pricing.service';
export type RetailDiscount = { type: 'PERCENTAGE' | 'AMOUNT'; value: number };
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function applyRetailDiscount(line: PosPriceLine, saleType: PosSaleType, discount?: RetailDiscount): PosPriceLine {
  if (!discount) return line;
  if (saleType !== 'RETAIL') throw new BadRequestException('Manual discounts are available only for retail sales.');
  if (!['PERCENTAGE', 'AMOUNT'].includes(discount.type) || typeof discount.value !== 'number' || !Number.isFinite(discount.value) || discount.value < 0) {
    throw new BadRequestException('A valid retail discount is required.');
  }
  if (discount.type === 'PERCENTAGE' && discount.value > 100) throw new BadRequestException('Retail discount percentage cannot exceed 100.');
  if (discount.type === 'AMOUNT' && discount.value > line.grossTotal) throw new BadRequestException('Retail discount amount cannot exceed the item line total.');
  const amount = discount.type === 'PERCENTAGE' ? money(line.grossTotal * discount.value / 100) : money(discount.value);
  return {
    ...line,
    retailDiscount: { ...discount },
    priceListItemDiscountId: null,
    discountType: `MANUAL_${discount.type}`,
    discountValue: String(discount.value),
    discountAmount: amount,
    discountPercentage: discount.type === 'PERCENTAGE' ? discount.value : line.grossTotal ? Number((amount / line.grossTotal * 100).toFixed(4)) : 0,
    discountPerUnit: line.quantity ? money(amount / line.quantity) : 0,
    netTotal: money(line.grossTotal - amount),
  };
}
