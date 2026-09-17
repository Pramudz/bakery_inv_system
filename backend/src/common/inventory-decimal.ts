import { ConflictException } from "@nestjs/common";
import {
  decimal4,
  format4,
} from "../features/price-list-item-discounts/discount-money";

// DECIMAL(18,4), half away from zero. Never convert inventory money to Number.
export function units(value: string) {
  try {
    const n = decimal4(value);
    checked(n);
    return n;
  } catch {
    throw new ConflictException("Invalid inventory decimal state.");
  }
}
export function checked(value: bigint): string {
  if (
    value <= -1_000_000_000_000_000_000n ||
    value >= 1_000_000_000_000_000_000n
  )
    throw new ConflictException("Inventory decimal exceeds DECIMAL(18,4).");
  return format4(value);
}
export function multiply(a: bigint, b: bigint) {
  const value = a * b;
  return (
    ((value < 0n ? -1n : 1n) * ((value < 0n ? -value : value) + 5000n)) / 10000n
  );
}
export function sum4(values: string[]) {
  return checked(values.reduce((sum, value) => sum + units(value), 0n));
}
