import { BadRequestException } from '@nestjs/common';

export const codeKey = (value: unknown) => String(value ?? '').trim().toLocaleUpperCase('en-US');
export function optionalBoolean(value: string, field: string): boolean | undefined {
  if (!value) return undefined;
  if (value.toUpperCase() === 'TRUE') return true;
  if (value.toUpperCase() === 'FALSE') return false;
  throw new BadRequestException(`${field} must be TRUE or FALSE.`);
}
export function positiveNumber(value: string, field: string, required = true): number | undefined {
  if (!value && !required) return undefined;
  const number = Number(value);
  if (!value || !Number.isFinite(number) || number <= 0) throw new BadRequestException(`${field} must be a positive number.`);
  return number;
}
export function nonnegativeInteger(value: string, field: string): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new BadRequestException(`${field} must be a nonnegative whole number.`);
  return number;
}
export function optionalDate(value: string, field: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2}))?$/.test(value))
    throw new BadRequestException(`${field} must be YYYY-MM-DD or an ISO date-time with offset.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} is invalid.`);
  const calendar = value.slice(0, 10);
  if (new Date(`${calendar}T00:00:00.000Z`).toISOString().slice(0, 10) !== calendar)
    throw new BadRequestException(`${field} is an impossible calendar date.`);
  return date;
}
export function currency(value: string, fallback = 'LKR') {
  const code = codeKey(value || fallback);
  if (!/^[A-Z]{3}$/.test(code)) throw new BadRequestException('CurrencyCode must be a three-letter code.');
  return code;
}
export function operation(value: string, onboarding: boolean): 'CREATE' | 'UPDATE' | 'REVISE' | 'END' | 'SKIP' {
  const code = codeKey(value || (onboarding ? 'CREATE' : ''));
  if (!['CREATE', 'UPDATE', 'REVISE', 'END', 'SKIP'].includes(code))
    throw new BadRequestException('An explicit valid Operation is required.');
  return code as 'CREATE' | 'UPDATE' | 'REVISE' | 'END' | 'SKIP';
}
