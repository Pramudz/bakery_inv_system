import assert from 'node:assert/strict';
import test from 'node:test';
import { inclusiveCalendarDays, reportPeriod } from './report-period';

test('canonical periods keep ISO week years and month years separate', () => {
  assert.deepEqual(reportPeriod('2027-01-01', 'WEEKLY'), { periodKey: '2026-W53', weekYear: 2026,
    weekNumber: 53, weekLabel: '2026-W53', weekStartDate: '2026-12-28', weekEndDate: '2027-01-03' });
  assert.equal(reportPeriod('2026-10-08', 'WEEKLY').weekStartDate, '2026-10-05');
  assert.notEqual(reportPeriod('2025-10-08', 'MONTHLY').periodKey, reportPeriod('2026-10-08', 'MONTHLY').periodKey);
  assert.equal(reportPeriod('2026-10-08', 'DAILY').businessDate, '2026-10-08');
  assert.equal(reportPeriod('2026-10-08', 'AGGREGATED').periodKey, 'ALL');
  assert.equal(reportPeriod('2026-10-08', 'YEARLY').year, 2026);
  assert.equal(inclusiveCalendarDays('2026-10-01', '2026-10-30'), 30);
});
