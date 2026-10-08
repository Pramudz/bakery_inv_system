export type TimeGranularity = 'AGGREGATED' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface ReportPeriod {
  periodKey: string;
  businessDate?: string;
  weekYear?: number;
  weekNumber?: number;
  weekLabel?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  year?: number;
  monthNumber?: number;
  monthName?: string;
}

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

export function reportPeriod(day: string, granularity: TimeGranularity): ReportPeriod {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || dateOnly(new Date(`${day}T00:00:00Z`)) !== day)
    throw new Error('A canonical business date is required.');
  if (granularity === 'AGGREGATED') return { periodKey: 'ALL' };
  if (granularity === 'DAILY') return { periodKey: day, businessDate: day };
  const date = new Date(`${day}T00:00:00Z`);
  const year = date.getUTCFullYear();
  if (granularity === 'YEARLY') return { periodKey: String(year), year };
  if (granularity === 'MONTHLY') {
    const monthNumber = date.getUTCMonth() + 1;
    return { periodKey: `${year}-${String(monthNumber).padStart(2, '0')}`, year, monthNumber,
      monthName: new Intl.DateTimeFormat('en', { month: 'long', timeZone: 'UTC' }).format(date) };
  }
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const thursday = new Date(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const weekYear = thursday.getUTCFullYear();
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7));
  const weekNumber = 1 + Math.round((monday.getTime() - jan4.getTime()) / 604_800_000);
  const weekLabel = `${weekYear}-W${String(weekNumber).padStart(2, '0')}`;
  return { periodKey: weekLabel, weekYear, weekNumber, weekLabel,
    weekStartDate: dateOnly(monday), weekEndDate: dateOnly(sunday) };
}

export function inclusiveCalendarDays(from: string, to: string) {
  reportPeriod(from, 'DAILY'); reportPeriod(to, 'DAILY');
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
  if (days <= 0) throw new Error('Rate horizon end precedes start.');
  return days;
}
