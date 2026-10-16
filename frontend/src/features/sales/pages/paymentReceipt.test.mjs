import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { act } from 'react';

const result = await build({
  entryPoints: [path.resolve('src/features/sales/pages/PaymentReceipt.tsx')],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external', loader: { '.css': 'empty' },
  plugins: [{ name: 'receipt-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /\/(AuthContext|pendingPaymentsApi|posPrintStatusApi)$/ }, ({ path: name }) => ({ path: name.split('/').pop(), namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path: name }) => ({ loader: 'js', contents: name === 'AuthContext'
      ? "export const useAuth = () => ({ tenant: { tenantName: 'Test Company', timeZone: 'Asia/Colombo' } });"
      : name === 'pendingPaymentsApi' ? 'export const pendingPaymentsApi = { receipt: (...args) => globalThis.__receiptUi.receipt(...args) };'
        : 'export const posPrintStatusApi = { get: (...args) => globalThis.__receiptUi.get(...args), print: (...args) => globalThis.__receiptUi.print(...args) };' }));
  } }],
});
const localRequire = createRequire(import.meta.url);
const { QueryClient, QueryClientProvider } = localRequire('@tanstack/react-query');
const bundle = new Module(path.resolve('src/features/sales/pages/paymentReceipt.bundle.cjs'));
bundle.filename = path.resolve('src/features/sales/pages/paymentReceipt.bundle.cjs');
bundle.paths = Module._nodeModulePaths(process.cwd());
bundle._compile(result.outputFiles[0].text, bundle.filename);
const { PaymentReceiptContent, PaymentReceiptPanel } = bundle.exports;

test('historical receipt uses persisted balances even without invoice or customer relations', () => {
  const payment = { invoicePaymentId: 17, paidAt: '2026-10-08T00:04:00Z', amount: '200.00',
    tenderedAmount: '200.00', changeAmount: '0.00', balanceBefore: '400.00', balanceAfter: '200.00',
    referenceNumber: null, paymentMethod: { paymentMethodName: 'Cash' }, isReversed: false };
  const html = renderToStaticMarkup(React.createElement(PaymentReceiptContent, { receipt: payment }));
  assert.match(html, /PAY-000017/);
  assert.match(html, /Walk-in Customer/);
  assert.match(html, /Previous balance.*400\.00/s);
  assert.match(html, /Outstanding balance.*200\.00/s);
  assert.match(html, /PARTIALLY PAID/);
  const reversed = renderToStaticMarkup(React.createElement(PaymentReceiptContent, { receipt: { ...payment, isReversed: true } }));
  assert.match(reversed, /REVERSED/);
});

test('receipt loads by payment ID and sends a print job only after an explicit click', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let printCalls = 0;
  dom.window.print = () => { throw new Error('Browser print dialog must not open'); };
  const payment = { invoicePaymentId: 17, paidAt: '2026-10-08T00:04:00Z', amount: '200.00', tenderedAmount: '200.00', changeAmount: '0.00', balanceBefore: '400.00', balanceAfter: '200.00', referenceNumber: null, paymentMethod: { paymentMethodName: 'Cash' }, isReversed: false };
  globalThis.__receiptUi = { receipt: async (id) => { assert.equal(id, 17); return payment; }, get: async () => ({ status: printCalls ? 'PENDING' : 'NOT_REQUESTED' }), print: async () => { printCalls += 1; return { jobId: 1, status: 'PENDING', reprint: false }; } };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('app'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  try {
    await act(async () => root.render(React.createElement(QueryClientProvider, { client }, React.createElement(PaymentReceiptPanel, { paymentId: 17, onClose: () => {} }))));
    for (let index = 0; index < 3; index++) await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    assert.equal(printCalls, 0);
    assert.match(document.body.textContent, /PAY-000017/);
    await act(async () => [...document.querySelectorAll('button')].find((button) => button.textContent === 'Print Receipt').click());
    assert.equal(printCalls, 1);
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); }
});
