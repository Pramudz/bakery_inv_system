export type EffectivePeriod = {
  isActive: boolean;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
};

export function effectiveInstantStatus(
  row: EffectivePeriod,
  now: Date,
) {
  if (!row.isActive) return "INACTIVE" as const;

  const effectiveFrom = new Date(row.effectiveFrom);
  const effectiveTo = row.effectiveTo
    ? new Date(row.effectiveTo)
    : null;

  if (effectiveFrom > now) return "FUTURE" as const;
  if (effectiveTo && effectiveTo < now) return "EXPIRED" as const;

  return "CURRENT" as const;
}

export function effectivePriceStatus(row: EffectivePeriod, now: Date, timeZone: string) {
  if (!row.isActive) return 'INACTIVE' as const;
  const fromInstant = new Date(row.effectiveFrom);
  const fromDate = businessDateOnly(row.effectiveFrom, timeZone)!;
  const dateOnlyPeriod = typeof row.effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.effectiveFrom)
    || fromInstant.getTime() === businessDayStart(fromDate, timeZone).getTime();
  if (!dateOnlyPeriod) {
    if (fromInstant > now) return 'FUTURE' as const;
    if (row.effectiveTo && new Date(row.effectiveTo) < now) return 'EXPIRED' as const;
    return 'CURRENT' as const;
  }
  const businessDate = businessDateAt(now, timeZone);
  if (isEffectiveOnBusinessDate(row, businessDate, timeZone)) return 'CURRENT' as const;
  if (businessDateOnly(row.effectiveFrom, timeZone)! > businessDate) return 'FUTURE' as const;
  if (row.effectiveTo && businessDateOnly(row.effectiveTo, timeZone)! < businessDate) return 'EXPIRED' as const;
  return 'CURRENT' as const;
}

export function periodsOverlap(
  aFrom: Date,
  aTo: Date | null,
  bFrom: Date,
  bTo: Date | null,
) {
  const forever = new Date(8640000000000000);
  return aFrom <= (bTo ?? forever) && bFrom <= (aTo ?? forever);
}

export function priceDateStart(value: string | Date, timeZone: string) {
  const dateOnly = typeof value === 'string' ? value.slice(0, 10) : businessDateAt(value, timeZone);
  return businessDayStart(dateOnly, timeZone);
}

export function priceDateEnd(value: string | Date, timeZone: string) {
  const dateOnly = typeof value === 'string' ? value.slice(0, 10) : businessDateAt(value, timeZone);
  return businessDayEnd(dateOnly, timeZone);
}

export function priceDateOnly(value: string | Date | null | undefined, timeZone: string) {
  return businessDateOnly(value, timeZone);
}

export function selectCurrentPrice<T extends EffectivePeriod>(rows: T[], now: Date, timeZone: string) {
  return rows
    .filter((row) => effectivePriceStatus(row, now, timeZone) === 'CURRENT')
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
}
import { businessDateAt, businessDateOnly, businessDayEnd, businessDayStart, isEffectiveOnBusinessDate } from '../../common/business-date';
