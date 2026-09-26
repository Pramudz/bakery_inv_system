import assert from 'node:assert/strict';
import test from 'node:test';
import { businessDateAt, businessDayEnd, businessDayStart, isEffectiveOnBusinessDate, isSupportedIanaTimeZone } from '../../common/business-date';

test('tenant business date does not follow the UTC calendar date', () => {
  const instant = new Date('2026-08-21T20:56:13.862Z');
  assert.equal(businessDateAt(instant, 'Asia/Colombo'), '2026-08-22');
  assert.equal(businessDateAt(instant, 'America/New_York'), '2026-08-21');
});

test('business day boundaries represent midnight in the tenant timezone', () => {
  assert.equal(businessDayStart('2026-08-22', 'Asia/Colombo').toISOString(), '2026-08-21T18:30:00.000Z');
  assert.equal(businessDayEnd('2026-08-22', 'Asia/Colombo').toISOString(), '2026-08-22T18:29:59.999Z');
});

test('business day boundaries account for daylight-saving transitions', () => {
  const start = businessDayStart('2026-03-08', 'America/New_York');
  const end = businessDayEnd('2026-03-08', 'America/New_York');
  assert.equal(end.getTime() - start.getTime() + 1, 23 * 60 * 60 * 1000);
});

test('same-day effective end remains current for the entire business date', () => {
  assert.equal(isEffectiveOnBusinessDate({ isActive: true, effectiveFrom: '2026-08-22', effectiveTo: '2026-08-22' }, '2026-08-22', 'Asia/Colombo'), true);
});

test('only supported IANA identifiers are accepted', () => {
  assert.equal(isSupportedIanaTimeZone('Asia/Colombo'), true);
  assert.equal(isSupportedIanaTimeZone('UTC+05:30'), false);
  assert.equal(isSupportedIanaTimeZone('not/a-zone'), false);
});
