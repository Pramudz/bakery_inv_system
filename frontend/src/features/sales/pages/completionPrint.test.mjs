import assert from 'node:assert/strict';
import test from 'node:test';
import { requestCompletionPrint } from './completionPrint.ts';

test('accepted print request closes completion receipt once without waiting for a printer', async () => {
  const lock = { current: false };
  const events = [];
  let resolveRequest;
  let requests = 0;
  const request = () => { requests++; return new Promise((resolve) => { resolveRequest = resolve; }); };
  const callbacks = { pending: (value) => events.push(`pending:${value}`), error: (value) => events.push(`error:${value}`), accepted: () => events.push('close') };
  const first = requestCompletionPrint(lock, request, callbacks);
  assert.equal(await requestCompletionPrint(lock, request, callbacks), false);
  assert.equal(requests, 1);
  assert.equal(events.includes('close'), false);
  resolveRequest({ status: 'PENDING' });
  assert.equal(await first, true);
  assert.deepEqual(events, ['pending:true', 'error:', 'close', 'pending:false']);
});

test('failed print request keeps the completed receipt open and unlocks retry', async () => {
  const lock = { current: false };
  const events = [];
  const callbacks = { pending: (value) => events.push(`pending:${value}`), error: (value) => events.push(`error:${value}`), accepted: () => events.push('close') };
  assert.equal(await requestCompletionPrint(lock, async () => { throw new Error('Printer profile unavailable'); }, callbacks), false);
  assert.equal(lock.current, false);
  assert.deepEqual(events, ['pending:true', 'error:', 'error:Printer profile unavailable', 'pending:false']);
  assert.equal(await requestCompletionPrint(lock, async () => ({ status: 'PENDING' }), callbacks), true);
  assert.equal(events.at(-2), 'close');
});
