import { BadRequestException } from '@nestjs/common';

export type BillDiscountInput = { type: 'PERCENTAGE' | 'FIXED'; value: number } | undefined;

function cents(value: number): number {
  const result = Math.round(value * 100);
  if (!Number.isFinite(value) || !Number.isSafeInteger(result) || Math.abs(result / 100 - value) > 0.000001) {
    throw new BadRequestException('Invoice amounts must be valid cent values.');
  }
  return result;
}

export function applyBillDiscount(lineNetAmounts: number[], input: BillDiscountInput) {
  const lineCents = lineNetAmounts.map(cents);
  if (lineCents.some((value) => value < 0)) throw new BadRequestException('Invoice line amounts cannot be negative.');
  const base = lineCents.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(base)) throw new BadRequestException('Invoice total is too large.');
  const value = input?.value ?? 0;
  if (!Number.isFinite(value) || value < 0) throw new BadRequestException('Bill discount must be a non-negative number.');
  let discount = 0;
  if (input?.type === 'PERCENTAGE') {
    if (value > 100 || !Number.isInteger(Math.round(value * 10000)) || Math.abs(Math.round(value * 10000) / 10000 - value) > 0.0000001) {
      throw new BadRequestException('Bill discount percentage must be 0–100 with at most four decimal places.');
    }
    const scaled = BigInt(Math.round(value * 10000));
    discount = Number((BigInt(base) * scaled + 500000n) / 1000000n);
  } else if (input?.type === 'FIXED') {
    discount = cents(value);
  } else if (input) {
    throw new BadRequestException('Unknown bill discount type.');
  }
  if (discount > base) throw new BadRequestException('Bill discount cannot exceed the amount after item discounts.');
  const allocation = lineCents.map((line) => base === 0 ? 0 : Number(BigInt(line) * BigInt(discount) / BigInt(base)));
  let remainder = discount - allocation.reduce((sum, amount) => sum + amount, 0);
  // Stable invoice line order absorbs fractional cents. Zero-value lines never receive an allocation.
  for (let index = 0; remainder > 0; index = (index + 1) % allocation.length) {
    if (lineCents[index] === 0 || allocation[index] >= lineCents[index]) continue;
    allocation[index] += 1;
    remainder -= 1;
  }
  return { base: base / 100, discount: discount / 100, total: (base - discount) / 100, allocation: allocation.map((amount) => amount / 100) };
}
