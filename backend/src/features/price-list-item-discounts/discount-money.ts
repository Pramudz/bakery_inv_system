import { BadRequestException } from '@nestjs/common';
import { PriceListItemDiscountType } from './price-list-item-discounts.entity';

const SCALE = 10_000n;
export function decimal4(value: string | number) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) throw new BadRequestException('Invalid decimal value.');
  const negative = text.startsWith('-');
  const [whole, fraction = ''] = (negative ? text.slice(1) : text).split('.');
  const roundedSource = (fraction + '00000').slice(0, 5);
  let scaled = BigInt(whole) * SCALE + BigInt(roundedSource.slice(0, 4));
  if (Number(roundedSource[4]) >= 5) scaled += 1n;
  return negative ? -scaled : scaled;
}

export function format4(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / SCALE}.${String(absolute % SCALE).padStart(4, '0')}`;
}

export function discountBreakdown(basePrice: string, type: PriceListItemDiscountType, value: string) {
  const base = decimal4(basePrice);
  const discountValue = decimal4(value);
  const amount = type === PriceListItemDiscountType.PERCENTAGE
    ? (base * discountValue + 50n * SCALE) / (100n * SCALE)
    : discountValue;
  if (amount > base) throw new BadRequestException('Discount cannot exceed the base selling price.');
  return { amount: format4(amount), finalPrice: format4(base - amount) };
}
