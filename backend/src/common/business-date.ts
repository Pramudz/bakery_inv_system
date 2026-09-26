import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Tenant } from '../features/tenants/tenant.entity';

export const DEFAULT_TENANT_TIME_ZONE = 'Asia/Colombo';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isSupportedIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value === 'UTC' || value.includes('/');
  } catch {
    return false;
  }
}

export function assertSupportedIanaTimeZone(value: string): string {
  const normalized = value.trim();
  if (!isSupportedIanaTimeZone(normalized))
    throw new BadRequestException('timeZone must be a supported IANA timezone identifier.');
  return normalized;
}

function dateParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: get('year'), month: get('month'), day: get('day'),
    hour: get('hour'), minute: get('minute'), second: get('second'),
  };
}

export function businessDateAt(instant: Date, timeZone: string): string {
  assertSupportedIanaTimeZone(timeZone);
  const { year, month, day } = dateParts(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addCalendarDays(dateOnly: string, days: number): string {
  const match = DATE_ONLY.exec(dateOnly);
  if (!match) throw new BadRequestException('Business date must use YYYY-MM-DD.');
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function businessDayStart(dateOnly: string, timeZone: string): Date {
  assertSupportedIanaTimeZone(timeZone);
  const match = DATE_ONLY.exec(dateOnly);
  if (!match) throw new BadRequestException('Business date must use YYYY-MM-DD.');
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const rendered = dateParts(new Date(candidate), timeZone);
    const renderedAsUtc = Date.UTC(rendered.year, rendered.month - 1, rendered.day, rendered.hour, rendered.minute, rendered.second, 0);
    const correction = desired - renderedAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }
  return new Date(candidate);
}

export function businessDayEnd(dateOnly: string, timeZone: string): Date {
  return new Date(businessDayStart(addCalendarDays(dateOnly, 1), timeZone).getTime() - 1);
}

export function businessDateOnly(value: string | Date | null | undefined, timeZone: string) {
  if (!value) return null;
  if (typeof value === 'string' && DATE_ONLY.test(value.slice(0, 10))) return value.slice(0, 10);
  return businessDateAt(value instanceof Date ? value : new Date(value), timeZone);
}

export function isEffectiveOnBusinessDate(
  row: { isActive?: boolean; effectiveFrom?: string | Date; effectiveTo?: string | Date | null },
  businessDate: string,
  timeZone: string,
) {
  if (row.isActive === false || !row.effectiveFrom) return false;
  const from = businessDateOnly(row.effectiveFrom, timeZone)!;
  const to = businessDateOnly(row.effectiveTo, timeZone);
  return from <= businessDate && (!to || to >= businessDate);
}

export async function tenantBusinessClock(manager: EntityManager, tenantId: number, now = new Date()) {
  const tenant = await manager.getRepository(Tenant).findOneBy({ tenantId });
  if (!tenant) throw new BadRequestException('Authenticated tenant was not found.');
  const timeZone = assertSupportedIanaTimeZone(tenant.timeZone);
  const businessDate = businessDateAt(now, timeZone);
  return {
    now,
    timeZone,
    businessDate,
    dayStart: businessDayStart(businessDate, timeZone),
    dayEnd: businessDayEnd(businessDate, timeZone),
  };
}
