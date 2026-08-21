export type EffectivePeriod = {
  isActive: boolean;
  effectiveFrom: Date | string;
  effectiveTo: Date | string | null;
};

export function effectivePriceStatus(row: EffectivePeriod, now = new Date()) {
  if (!row.isActive) return 'INACTIVE' as const;
  if (new Date(row.effectiveFrom) > now) return 'FUTURE' as const;
  if (row.effectiveTo && new Date(row.effectiveTo) < now) return 'EXPIRED' as const;
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

export function priceDateStart(value: string | Date) {
  const date = value instanceof Date
    ? new Date(value)
    : new Date(`${value.slice(0, 10)}T00:00:00.000`);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function priceDateEnd(value: string | Date) {
  const date = value instanceof Date
    ? new Date(value)
    : new Date(`${value.slice(0, 10)}T23:59:59.999`);
  date.setHours(23, 59, 59, 999);
  return date;
}

export function priceDateOnly(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function selectCurrentPrice<T extends EffectivePeriod>(rows: T[], now = new Date()) {
  return rows
    .filter((row) => effectivePriceStatus(row, now) === 'CURRENT')
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime())[0];
}
