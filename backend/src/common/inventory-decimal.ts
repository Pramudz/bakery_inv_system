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

// Converts an entered DECIMAL(18,4) quantity through a DECIMAL(18,6)
// ProductUnit factor without using floating-point arithmetic.
export function baseQuantity(quantity: string, conversionFactor: string) {
  const factor = decimal6(conversionFactor);
  if (factor <= 0n) throw new ConflictException("Invalid product-unit conversion factor.");
  return checked(roundDivide(units(quantity) * factor, 1_000_000n));
}

// Divides one DECIMAL(18,4) value by another and returns DECIMAL(18,4).
export function divide4(value: bigint, divisor: bigint) {
  if (divisor === 0n) throw new ConflictException("Inventory decimal division by zero.");
  return checked(roundDivide(value * 10_000n, divisor));
}

function decimal6(value: string) {
  const text = String(value).trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(text))
    throw new ConflictException("Invalid product-unit conversion factor.");
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const rounded = (fraction + "0000000").slice(0, 7);
  let scaled = BigInt(whole) * 1_000_000n + BigInt(rounded.slice(0, 6));
  if (Number(rounded[6]) >= 5) scaled += 1n;
  return negative ? -scaled : scaled;
}

function roundDivide(numerator: bigint, denominator: bigint) {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const rounded = (n + d / 2n) / d;
  return negative ? -rounded : rounded;
}
