import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { newRecoveryIntent, recoveryStorageKey, saveRecoveryIntent } from '../transactionRecoveryStorage.ts';

const directory = path.dirname(fileURLToPath(import.meta.url));
const localRequire = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = localRequire('@tanstack/react-query');
const { MemoryRouter } = localRequire('react-router-dom');
let bundleNumber = 0;

async function loadPage(name) {
  const virtual = {
    auth: 'export const useAuth = () => globalThis.__recoveryPageTest.auth;',
    api: `export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
      globalThis.__recoveryPageTest.ApiError = ApiError;
      export const apiClient = { get: (url) => globalThis.__recoveryPageTest.get(url), post: (url, body) => globalThis.__recoveryPageTest.post(url, body) };`,
    session: 'export const posRegistersApi = { sessionContext: () => globalThis.__recoveryPageTest.session() };',
  };
  const result = await build({
    entryPoints: [path.join(directory, name)], bundle: true, write: false, platform: 'node', format: 'cjs', jsx: 'automatic',
    external: ['react', 'react-dom', 'react-dom/*', 'react/jsx-runtime', '@tanstack/react-query', 'react-router-dom'],
    loader: { '.css': 'empty' },
    plugins: [{ name: 'recovery-page-api', setup(plugin) {
      plugin.onResolve({ filter: /./ }, (args) => {
        if (args.path.endsWith('/AuthContext')) return { path: 'auth', namespace: 'recovery-test' };
        if (args.path.endsWith('/apiClient')) return { path: 'api', namespace: 'recovery-test' };
        if (args.path.endsWith('/posRegistersApi')) return { path: 'session', namespace: 'recovery-test' };
      });
      plugin.onLoad({ filter: /.*/, namespace: 'recovery-test' }, (args) => ({ contents: virtual[args.path], loader: 'js' }));
    } }],
  });
  const filename = path.join(directory, `recovery-page-bundle-${++bundleNumber}.cjs`);
  const Module = localRequire('node:module');
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(directory);
  module._compile(result.outputFiles[0].text, filename);
  return module.exports[name.replace('.tsx', '')];
}

function browser() {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'HTMLDialogElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const root = createRoot(dom.window.document.getElementById('app'));
  return { dom, root, close: async () => { await act(async () => root.unmount()); dom.window.close(); } };
}

async function renderPage(Page, root, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(React.createElement(MemoryRouter, { initialEntries: [route] },
    React.createElement(QueryClientProvider, { client }, React.createElement(Page)))));
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  return client;
}

test('collection page restores a committed payment by original key after refresh without posting', async () => {
  const env = browser();
  const key = 'c90c3ee5-58ec-4f77-9c5c-9a8d3fbac4c0';
  const intent = newRecoveryIntent('collection', 501, 9, 42, 6, { collectionKey: key, amount: 2000, paymentMethodId: 2 }, { registerSessionId: 3, cashierSessionId: 4 });
  saveRecoveryIntent(localStorage, intent);
  const calls = [];
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 501 }, tenantUser: { userId: 9 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    get: async (url) => { calls.push(url); if (url.includes('/payments/by-key/')) return { invoicePaymentId: 77, invoiceId: 42, collectionKey: key, tenderedAmount: '2000.00', amount: '2000.00', changeAmount: '0.00', balanceBefore: '5000.00', balanceAfter: '3000.00', paymentMethodId: 2, paymentChannelId: null, referenceNumber: null, posRegisterSessionId: 3, posCashierSessionId: 4, paidAt: new Date().toISOString(), isReversed: false, invoice: { invoiceId: 42, invoiceNumber: 'AUD', customer: { customerName: 'Audit' }, location: { name: 'Audit' } }, paymentMethod: { paymentMethodName: 'Cash' } }; if (url.includes('/pending-payments/page')) return { items: [], total: 0, stats: { outstanding: 0, partiallyPaid: 0, unpaid: 0 } }; if (url.includes('/payment-receipts/page')) return { items: [], total: 0, stats: { received: 0 } }; return []; },
    post: async () => { throw Error('Restoration must not POST'); },
  };
  try {
    const Page = await loadPage('PendingPaymentsPage.tsx');
    await renderPage(Page, env.root);
    assert.ok(calls.some((url) => url.includes(`/invoices/42/payments/by-key/${key}`)));
    assert.equal(localStorage.getItem(recoveryStorageKey('collection', 501, 9, 42)), null);
    assert.match(document.body.textContent, /PAY-000077/);
  } finally { await env.close(); }
});

test('refund page restores a committed stock-return refund by original key after refresh without posting', async () => {
  const env = browser();
  const key = '07c4f91c-96bf-4bc1-8f89-487af56f2bc4';
  const intent = newRecoveryIntent('refund', 502, 10, 43, 7, { refundKey: key, invoiceId: 43, reason: 'Customer return', details: [{ invoiceDetailId: 89, quantity: 2, returnToStock: true }], payments: [{ paymentMethodId: 3, amount: 20 }] }, { registerSessionId: 5, cashierSessionId: 6 });
  saveRecoveryIntent(localStorage, intent);
  const calls = [];
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 502 }, tenantUser: { userId: 10 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    get: async (url) => { calls.push(url); if (url.includes('/invoice-refunds/by-key/')) return { invoiceRefundId: 88, invoiceId: 43, refundKey: key, refundTotal: '20.00', reason: 'Customer return', posRegisterSessionId: 5, posCashierSessionId: 6, details: [{ invoiceDetailId: 89, quantity: '2.0000', returnToStock: true }], payments: [{ paymentMethodId: 3, amount: '20.00', paymentChannelId: null, referenceNumber: null }] }; if (url.includes('/invoices/43/refundable')) return { invoiceId: 43, invoiceStatus: 'PARTIALLY_REFUNDED', invoiceDate: new Date().toISOString(), locationId: 7, grandTotal: '40.00', refundablePaymentAmount: '20.00', details: [], previousRefunds: [] }; if (url.includes('/invoice-refunds/page')) return { items: [], total: 0 }; if (url.includes('/invoice-adjustments')) return []; return []; },
    post: async () => { throw Error('Restoration must not POST'); },
  };
  try {
    const Page = await loadPage('RefundsPage.tsx');
    await renderPage(Page, env.root);
    assert.ok(calls.some((url) => url.includes(`/invoice-refunds/by-key/${key}?invoiceId=43`)));
    assert.equal(localStorage.getItem(recoveryStorageKey('refund', 502, 10, 43)), null);
    assert.match(document.body.textContent, /Refund completed/);
  } finally { await env.close(); }
});

test('collection page keeps the original request after NOT FOUND and retries once with its saved payload', async () => {
  const env = browser();
  const key = 'aa7c2da4-07be-4339-bc3a-c5aa21aec40b';
  const payload = { collectionKey: key, amount: 2000, paymentMethodId: 2, referenceNumber: 'AUD-123' };
  const intent = newRecoveryIntent('collection', 503, 11, 44, 8, payload);
  saveRecoveryIntent(localStorage, intent);
  const posts = [];
  let committed = false;
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 503 }, tenantUser: { userId: 11 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    get: async (url) => { if (url.includes('/payments/by-key/')) {
      if (!committed) throw Object.assign(new Error('Not found'), { status: 404 });
      return { invoicePaymentId: 79, invoiceId: 44, collectionKey: key, tenderedAmount: '2000.00', amount: '2000.00', changeAmount: '0.00', balanceBefore: '5000.00', balanceAfter: '3000.00', paymentMethodId: 2, paymentChannelId: null, referenceNumber: 'AUD-123', paidAt: new Date().toISOString(), isReversed: false, invoice: { invoiceId: 44, invoiceNumber: 'AUD', customer: { customerName: 'Audit' }, location: { name: 'Audit' } }, paymentMethod: { paymentMethodName: 'Cash' } };
    } if (url.includes('/pending-payments/page')) return { items: [], total: 0, stats: { outstanding: 0, partiallyPaid: 0, unpaid: 0 } }; if (url.includes('/payment-receipts/page')) return { items: [], total: 0, stats: { received: 0 } }; return []; },
    post: async (url, body) => { posts.push({ url, body }); committed = true; return {}; },
  };
  try {
    const Page = await loadPage('PendingPaymentsPage.tsx');
    await renderPage(Page, env.root);
    assert.match(document.body.textContent, /Unresolved collection/);
    assert.equal(localStorage.getItem(recoveryStorageKey('collection', 503, 11, 44)) !== null, true);
    await act(async () => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Retry original request');
      assert.ok(button);
      button.click(); button.click();
    });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(posts.length, 1, document.body.textContent);
    assert.deepEqual(posts[0].body, payload);
    assert.equal(localStorage.getItem(recoveryStorageKey('collection', 503, 11, 44)), null);
  } finally { await env.close(); }
});

test('refund page keeps the original request after NOT FOUND and retries once with its saved payload', async () => {
  const env = browser();
  const key = '70d0ef3c-1929-4852-b437-68614110d170';
  const payload = { refundKey: key, invoiceId: 45, reason: 'Customer return', details: [{ invoiceDetailId: 90, quantity: 2, returnToStock: true }], payments: [{ paymentMethodId: 3, amount: 20 }] };
  saveRecoveryIntent(localStorage, newRecoveryIntent('refund', 504, 12, 45, 9, payload));
  const posts = [];
  let committed = false;
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 504 }, tenantUser: { userId: 12 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    get: async (url) => { if (url.includes('/invoice-refunds/by-key/')) {
      if (!committed) throw Object.assign(new Error('Not found'), { status: 404 });
      return { invoiceRefundId: 91, invoiceId: 45, refundKey: key, refundTotal: '20.00', reason: 'Customer return', details: [{ invoiceDetailId: 90, quantity: '2.0000', returnToStock: true }], payments: [{ paymentMethodId: 3, amount: '20.00', paymentChannelId: null, referenceNumber: null }] };
    } if (url.includes('/invoices/45/refundable')) return { invoiceId: 45, invoiceStatus: 'PARTIALLY_REFUNDED', invoiceDate: new Date().toISOString(), locationId: 9, grandTotal: '40.00', refundablePaymentAmount: '20.00', details: [], previousRefunds: [] }; if (url.includes('/invoice-refunds/page')) return { items: [], total: 0 }; if (url.includes('/invoice-adjustments')) return []; return []; },
    post: async (url, body) => { posts.push({ url, body }); committed = true; return {}; },
  };
  try {
    const Page = await loadPage('RefundsPage.tsx');
    await renderPage(Page, env.root);
    assert.match(document.body.textContent, /Unresolved refund/);
    await act(async () => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent === 'Retry original request');
      assert.ok(button);
      button.click(); button.click();
    });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0].body, payload);
    assert.equal(localStorage.getItem(recoveryStorageKey('refund', 504, 12, 45)), null);
  } finally { await env.close(); }
});

test('collection page saves the new UUID and payload before POST and keeps them after a lost response', async () => {
  const env = browser();
  const posts = [];
  const invoice = { invoiceId: '46', invoiceNumber: 'AUD-46', invoiceDate: new Date().toISOString(), grandTotal: '5000.00', paidAmount: '0.00', balanceAmount: '5000.00', paymentStatus: 'UNPAID', collectionEligible: true, customer: { customerName: 'Audit', phone: null, mobile: null }, location: { locationId: '10', name: 'Audit store' } };
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 505 }, tenantUser: { userId: 13 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    session: async () => ({ registerSession: { posRegisterSessionId: '31' }, cashierSession: { posCashierSessionId: '32' } }),
    get: async (url) => { if (url.includes('/payments/by-key/')) throw Object.assign(new Error('Not found'), { status: 404 }); if (url.includes('/pending-payments/page')) return { items: [invoice], total: 1, stats: { outstanding: 5000, partiallyPaid: 0, unpaid: 1 } }; if (url.includes('/payment-receipts/page')) return { items: [], total: 0, stats: { received: 0 } }; if (url === '/payment-methods') return [{ paymentMethodId: 2, paymentMethodName: 'Cash', paymentMethodType: 'CASH', isActive: true }]; return []; },
    post: async (url, body) => {
      const stored = JSON.parse(localStorage.getItem(recoveryStorageKey('collection', 505, 13, 46)));
      assert.equal(stored.key, body.collectionKey);
      assert.deepEqual(stored.payload, JSON.parse(JSON.stringify(body)));
      posts.push({ url, body });
      throw new Error('Connection dropped after commit');
    },
  };
  try {
    const Page = await loadPage('PendingPaymentsPage.tsx');
    await renderPage(Page, env.root);
    await act(async () => [...document.querySelectorAll('button')].find((item) => item.textContent === 'Receive Payment').click());
    await act(async () => document.querySelector('.pending-dialog form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(posts.length, 1, document.body.textContent);
    const saved = JSON.parse(localStorage.getItem(recoveryStorageKey('collection', 505, 13, 46)));
    assert.equal(saved.key, posts[0].body.collectionKey);
    assert.equal(saved.status, 'uncertain');
    assert.equal(saved.registerSessionId, 31);
    assert.equal(saved.cashierSessionId, 32);
    assert.match(document.body.textContent, /Unresolved collection/);
  } finally { await env.close(); }
});

test('refund page saves line, stock-return choice and UUID before POST and keeps them after a lost response', async () => {
  const env = browser();
  window.confirm = () => true;
  const posts = [];
  const refundable = { invoiceId: '47', invoiceStatus: 'COMPLETED', invoiceDate: new Date().toISOString(), locationId: '11', grandTotal: '40.00', refundablePaymentAmount: '40.00', originalPaymentPosition: { paidAmount: '40.00', balanceAmount: '0.00' }, details: [{ invoiceDetailId: '91', product: { productName: 'Audit bread', sku: 'AUD', isStockItem: true }, quantity: '4.0000', refundableQuantity: 2, refundableAmount: '20.00', grossTotal: '40.00', netTotal: '40.00', discountAmount: '0.00', discountPercentage: '0.0000' }], previousRefunds: [] };
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 506 }, tenantUser: { userId: 14 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    session: async () => ({ registerSession: { posRegisterSessionId: '33' }, cashierSession: { posCashierSessionId: '34' } }),
    get: async (url) => { if (url.includes('/invoice-refunds/by-key/')) throw Object.assign(new Error('Not found'), { status: 404 }); if (url.includes('/invoices/47/refundable')) return refundable; if (url.includes('/invoice-refunds/page')) return { items: [], total: 0 }; if (url.includes('/invoice-adjustments')) return []; if (url === '/payment-methods') return [{ paymentMethodId: 3, paymentMethodName: 'Cash', paymentMethodType: 'CASH', isActive: true }]; return []; },
    post: async (url, body) => {
      const stored = JSON.parse(localStorage.getItem(recoveryStorageKey('refund', 506, 14, 47)));
      assert.equal(stored.key, body.refundKey);
      assert.deepEqual(stored.payload, JSON.parse(JSON.stringify(body)));
      posts.push({ url, body });
      throw new Error('Connection dropped after commit');
    },
  };
  try {
    const Page = await loadPage('RefundsPage.tsx');
    await renderPage(Page, env.root, '/refund?invoiceId=47');
    await act(async () => [...document.querySelectorAll('button')].find((item) => item.textContent === 'Full Refund').click());
    await act(async () => { const select = [...document.querySelectorAll('label')].find((item) => item.textContent.includes('Refund method')).querySelector('select'); select.value = '3'; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => [...document.querySelectorAll('button')].find((item) => item.textContent === 'Confirm Full Refund').click());
    for (let i = 0; i < 4; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(posts.length, 1, document.body.textContent);
    const saved = JSON.parse(localStorage.getItem(recoveryStorageKey('refund', 506, 14, 47)));
    assert.equal(saved.key, posts[0].body.refundKey);
    assert.deepEqual(saved.payload.details, [{ invoiceDetailId: 91, quantity: 2, returnToStock: true }]);
    assert.deepEqual(saved.payload.payments, [{ paymentMethodId: 3, amount: 20 }]);
    assert.equal(saved.registerSessionId, 33);
    assert.equal(saved.cashierSessionId, 34);
    assert.equal(saved.status, 'uncertain');
    assert.match(document.body.textContent, /Unresolved refund/);
  } finally { await env.close(); }
});

test('collection page checks every saved invoice key on restoration', async () => {
  const env = browser();
  const entries = [
    { invoiceId: 48, key: 'b80df2c1-26c0-4f08-b366-055799b1f901' },
    { invoiceId: 49, key: '72466d11-bb60-4dd5-8bc8-a2c5724f79b8' },
  ];
  for (const row of entries) saveRecoveryIntent(localStorage, newRecoveryIntent('collection', 507, 15, row.invoiceId, 12, { collectionKey: row.key, amount: 10, paymentMethodId: 2 }));
  const lookups = [];
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 507 }, tenantUser: { userId: 15 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    get: async (url) => { if (url.includes('/payments/by-key/')) {
      lookups.push(url);
      const row = entries.find((item) => url.includes(`/${item.invoiceId}/payments/by-key/${item.key}`));
      assert.ok(row);
      return { invoicePaymentId: row.invoiceId, invoiceId: row.invoiceId, collectionKey: row.key, tenderedAmount: '10.00', amount: '10.00', changeAmount: '0.00', balanceBefore: '20.00', balanceAfter: '10.00', paymentMethodId: 2, paymentChannelId: null, referenceNumber: null, paidAt: new Date().toISOString(), isReversed: false, invoice: { invoiceId: row.invoiceId, invoiceNumber: 'AUD', customer: { customerName: 'Audit' }, location: { name: 'Audit' } }, paymentMethod: { paymentMethodName: 'Cash' } };
    } if (url.includes('/pending-payments/page')) return { items: [], total: 0, stats: { outstanding: 0, partiallyPaid: 0, unpaid: 0 } }; if (url.includes('/payment-receipts/page')) return { items: [], total: 0, stats: { received: 0 } }; return []; },
    post: async () => { throw Error('Restoration must not POST'); },
  };
  try {
    const Page = await loadPage('PendingPaymentsPage.tsx');
    await renderPage(Page, env.root);
    assert.equal(lookups.length, 2);
    for (const row of entries) assert.equal(localStorage.getItem(recoveryStorageKey('collection', 507, 15, row.invoiceId)), null);
  } finally { await env.close(); }
});

test('collection conflict stays distinct from an uncertain NOT FOUND lookup and retains the saved key', async () => {
  const env = browser();
  const key = '3dfc31bf-4398-4536-a5e0-e524c65fc9e1';
  const payload = { collectionKey: key, amount: 10, paymentMethodId: 2 };
  saveRecoveryIntent(localStorage, newRecoveryIntent('collection', 508, 16, 50, 13, payload));
  globalThis.__recoveryPageTest = {
    auth: { tenant: { tenantId: 508 }, tenantUser: { userId: 16 }, role: null, accessScope: 'TENANT', assignedLocations: [] },
    get: async (url) => { if (url.includes('/payments/by-key/')) throw new globalThis.__recoveryPageTest.ApiError(404, 'Not found'); if (url.includes('/pending-payments/page')) return { items: [], total: 0, stats: { outstanding: 0, partiallyPaid: 0, unpaid: 0 } }; if (url.includes('/payment-receipts/page')) return { items: [], total: 0, stats: { received: 0 } }; return []; },
    post: async () => { throw new globalThis.__recoveryPageTest.ApiError(409, 'Different payment data'); },
  };
  try {
    const Page = await loadPage('PendingPaymentsPage.tsx');
    await renderPage(Page, env.root);
    await act(async () => [...document.querySelectorAll('button')].find((item) => item.textContent === 'Retry original request').click());
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.match(document.body.textContent, /Transaction conflict/);
    assert.match(document.body.textContent, /not confirmed yet/);
    assert.equal(JSON.parse(localStorage.getItem(recoveryStorageKey('collection', 508, 16, 50))).key, key);
  } finally { await env.close(); }
});
