import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { masterPayoutStorageKey, saveMasterPayoutIntent } from '../masterPayoutRecovery.ts';

const directory = path.dirname(fileURLToPath(import.meta.url));
const localRequire = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = localRequire('@tanstack/react-query');
const { MemoryRouter } = localRequire('react-router-dom');

async function page() {
  const virtual = {
    auth: 'export const useAuth = () => globalThis.__masterPayoutTest.auth;',
    api: 'export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }',
    payment: 'export const paymentMethodsApi = { list: async () => [] };',
    registers: `export const posRegistersApi = {
      masterClosingLocations: async () => [{ locationId: 4, code: 'TEST', name: 'Test' }],
      masterClosingSummary: async () => globalThis.__masterPayoutTest.summary,
      masterClosingHistory: async () => ({ items: [], total: 0, page: 1, limit: 20 }),
      masterPayoutOutcome: async (key) => globalThis.__masterPayoutTest.outcome(key),
      recordMasterRefundPayout: async (id, payload) => globalThis.__masterPayoutTest.post('REFUND', id, payload),
      recordMasterReversalPayout: async (id, payload) => globalThis.__masterPayoutTest.post('REVERSAL', id, payload),
    };`,
  };
  const result = await build({ entryPoints: [path.join(directory, 'PosMasterClosingPage.tsx')], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/*', 'react/jsx-runtime', '@tanstack/react-query', 'react-router-dom'], loader: { '.css': 'empty' },
    plugins: [{ name: 'master-payout-test', setup(plugin) {
      plugin.onResolve({ filter: /./ }, (args) => {
        if (args.path.endsWith('/AuthContext')) return { path: 'auth', namespace: 'master-test' };
        if (args.path.endsWith('/apiClient')) return { path: 'api', namespace: 'master-test' };
        if (args.path.endsWith('/paymentMethodsApi')) return { path: 'payment', namespace: 'master-test' };
        if (args.path.endsWith('/posRegistersApi')) return { path: 'registers', namespace: 'master-test' };
      });
      plugin.onLoad({ filter: /.*/, namespace: 'master-test' }, args => ({ contents: virtual[args.path], loader: 'js' }));
    } }],
  });
  const Module = localRequire('node:module');
  const module = new Module(path.join(directory, 'master-page-bundle.cjs'));
  module.filename = path.join(directory, 'master-page-bundle.cjs');
  module.paths = Module._nodeModulePaths(directory);
  module._compile(result.outputFiles[0].text, module.filename);
  return module.exports.PosMasterClosingPage;
}

const summary = { businessDate: '2026-10-11', posRegisterSessionId: 21, registerStatus: 'OPEN', openingBalance: 0,
  cashReceipts: { tendered: 0, change: 0, net: 0 }, movements: { out: 0, directMasterOut: 0 }, batchConfirmationDifference: 0,
  systemExpectedMasterCash: 0, confirmedBatchCashBasis: 0, approvedBatches: [], systemVsConfirmedBasis: 0,
  blockers: [], canSubmitCount: false };

test('master payout page restores a pending original UUID and retries its exact payload after NOT FOUND', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const intent = { version: 1, tenantId: '228', userId: '9', kind: 'REFUND', sourceId: 88, createdAt: new Date().toISOString(),
    payload: { payoutKey: '9f0daa67-f2bd-4cd6-af61-c3ca8c562ef7', locationId: 4, posRegisterSessionId: 21, paymentMethodId: 3, amount: 20, reason: 'Customer refund', physicalPayerIdentity: 'Cashier A' } };
  saveMasterPayoutIntent(localStorage, intent);
  const posts = [];
  globalThis.__masterPayoutTest = { auth: { tenant: { tenantId: 228 }, tenantUser: { userId: 9 }, role: { code: 'TENANT_ADMIN' }, permissions: [] }, summary,
    outcome: async () => { const error = new Error('Not found'); error.status = 404; throw error; },
    post: async (kind, id, payload) => { posts.push({ kind, id, payload }); return { posCashMovementId: 12 }; } };
  const root = createRoot(dom.window.document.getElementById('app'));
  try {
    const Page = await page();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => root.render(React.createElement(MemoryRouter, {}, React.createElement(QueryClientProvider, { client }, React.createElement(Page)))));
    for (let i = 0; i < 5; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(localStorage.getItem(masterPayoutStorageKey(228, 9)) !== null, true);
    assert.match(document.body.textContent, /Retry original request/);
    const retry = [...document.querySelectorAll('button')].find(button => button.textContent.includes('Retry original request'));
    await act(async () => retry.click());
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.deepEqual(posts, [{ kind: 'REFUND', id: 88, payload: intent.payload }]);
    assert.equal(localStorage.getItem(masterPayoutStorageKey(228, 9)), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    delete globalThis.__masterPayoutTest;
  }
});
