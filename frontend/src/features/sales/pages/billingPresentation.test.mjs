import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
const dom = new JSDOM('<!doctype html><html><body><div class="shell shell-billing shell-sidebar-collapsed"><main class="main"><header class="topbar"><div id="billing-header-slot" class="billing-header-slot"></div><div class="top-actions"><div class="profile"><span class="avatar user-avatar">T</span><div><strong>Tenant Administrator</strong><small>Administrator</small></div></div></div></header><section class="content"><div id="app"></div></section></main></div></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const { createRoot } = await import('react-dom/client');
const localRequire = createRequire(import.meta.url);
const { MemoryRouter } = localRequire('react-router-dom');
const { QueryClient, QueryClientProvider } = localRequire('@tanstack/react-query');

const result = await build({
  entryPoints: [path.resolve('src/features/sales/pages/BillingPage.tsx')],
  bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
  loader: { '.css': 'empty' },
  plugins: [{ name: 'billing-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /\/(AuthContext|apiClient|posRegistersApi)$/ }, ({ path }) => ({ path: path.split('/').pop(), namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'js', contents: path === 'AuthContext'
      ? 'export const useAuth = () => globalThis.__billingUi.auth;'
      : path === 'posRegistersApi' ? 'export const posRegistersApi = { sessionContext: async () => globalThis.__billingUi.session };'
        : 'export class ApiError extends Error {} export const apiClient = { get: (...args) => globalThis.__billingUi.get(...args), post: (...args) => globalThis.__billingUi.post(...args) };' }));
  } }],
});
const bundle = new Module(path.resolve('src/features/sales/pages/billingPresentation.bundle.cjs'));
bundle.filename = path.resolve('src/features/sales/pages/billingPresentation.bundle.cjs');
bundle.paths = Module._nodeModulePaths(process.cwd());
bundle._compile(result.outputFiles[0].text, bundle.filename);
const { BillingPage } = bundle.exports;

test('billing shows real register context, catalog category chips, separate summary, and safe empty checkout', async () => {
  const catalog = [{ productId: 1, code: 'TEA', name: 'Ceylon Tea', category: 'Beverages', retailPrice: 100, wholesalePrice: 90, stock: 10 }];
  const sales = [];
  const createdCustomers = [];
  globalThis.__billingUi = {
    auth: { permissions: [], role: { code: 'TENANT_ADMIN' }, tenant: { tenantId: '1' }, tenantUser: { userId: '1' } },
    session: { canBill: true, location: { name: 'Anuradhapura' }, config: { registerMode: 'TERMINAL_REGISTER' }, terminal: { displayName: 'Counter - 01', terminalCode: 'POS-01' }, registerSession: { status: 'OPEN', businessDate: '2026-10-13', posRegisterSessionId: 1 }, cashierSession: { status: 'ACTIVE', posCashierSessionId: 2 } },
    get: async url => url === '/invoices/locations' ? [{ locationId: 1, name: 'Anuradhapura', isActive: true }]
      : url.startsWith('/invoices/catalog') ? catalog
        : url.startsWith('/invoices/billing-shortcuts') ? { productIds: [1], categories: ['Beverages'], periodDays: 30 }
        : url === '/payment-methods' ? [{ paymentMethodId: 1, paymentMethodName: 'Cash', paymentMethodType: 'CASH', isActive: true }] : [],
    post: async (url, body) => {
      if (url === '/customers') { createdCustomers.push(body); if (createdCustomers.length === 1) throw new Error('Code already exists for this tenant.'); return { ...body, customerId: 43 }; }
      if (url === '/invoices/quote') return { quotedAt: new Date().toISOString(), locationId: 1, saleType: 'RETAIL', subtotal: 100, discountTotal: 0, grandTotal: 100,
        lines: [{ productId: 1, quantity: 1, unitPrice: 100, discountPerUnit: 0, discountPercentage: 0, discountAmount: 0, grossTotal: 100, netTotal: 100, currencyCode: 'LKR' }] };
      if (url === '/invoices') { sales.push(body); return { invoiceId: 42, invoiceNumber: 'INV42', invoiceDate: new Date().toISOString(), saleType: 'RETAIL', subtotal: '100', grandTotal: '100', paidAmount: '100', balanceAmount: '0', paymentStatus: 'PAID', details: [], payments: [] }; }
      throw new Error(`Unexpected request: ${url}`);
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const root = createRoot(document.getElementById('app'));
  try {
    await act(async () => root.render(React.createElement(MemoryRouter, null,
      React.createElement(QueryClientProvider, { client }, React.createElement(BillingPage)))));
    for (let i = 0; i < 6; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(document.querySelector('#billing-header-slot').textContent, /Anuradhapura.*Counter - 01.*OPEN.*ACTIVE/s);
    assert.ok(document.querySelector('#billing-header-slot .billing-manage-register'), 'Manage Register is available in the top bar');
    assert.equal(document.querySelector('.pos-session-card'), null, 'Duplicate register card is removed');
    assert.equal(document.querySelector('.billing-register-warning'), null, 'Ready sessions use no warning space');
    assert.ok(document.querySelector('.billing-context-area .billing-location-section'));
    assert.ok(document.querySelector('.billing-context-area .pos-customer'));
    assert.ok(document.querySelector('.billing-product-area .pos-product-picker'));
    assert.ok(document.querySelector('.billing-context-area > .sale-type-section'));
    assert.deepEqual([...document.querySelector('.billing-context-area').children].map(element =>
      element.classList.contains('billing-location-section') ? 'Location' : element.classList.contains('sale-type-section') ? 'Sale Type' : 'Customer'), ['Location', 'Sale Type', 'Customer']);
    assert.ok(document.querySelector('.pos-workspace > .billing-selection-layout'));
    assert.ok(document.querySelector('.pos-workspace > .pos-cart'));
    assert.ok(!document.querySelector('.pos-product-picker .sales-card-head p'));
    assert.equal(document.querySelector('.billing-cart-summary').parentElement.className, 'pos-checkout');
    assert.ok(!document.querySelector('.pos-payment .billing-cart-summary'));
    assert.equal(document.querySelector('.pos-complete').disabled, true);
    assert.deepEqual([...document.querySelectorAll('kbd.billing-heading-shortcut')].map(item => item.textContent).filter(text => /^F[1-6]$/.test(text)).sort(), ['F1', 'F2', 'F3', 'F4', 'F5', 'F6']);
    assert.equal(document.querySelector('.pos-cart .billing-clear-button kbd').textContent, 'Del');
    assert.equal(document.querySelectorAll('.billing-clear-button').length, 3);
    assert.ok(document.querySelector('.pos-customer .billing-new-customer'));
    await act(async () => document.querySelector('.pos-customer .billing-new-customer').click());
    assert.ok(document.querySelector('dialog[open]'), '+ New opens a customer popup');
    assert.equal(document.querySelector('.new-customer-fields'), null);
    await act(async () => [...document.querySelectorAll('dialog button')].find(button => button.textContent === 'Cancel').click());
    assert.equal(document.querySelector('dialog[open]'), null);
    await act(async () => document.querySelector('.pos-customer .billing-new-customer').click());
    const address = { addressLine1: '123 Main Street', addressLine2: 'Apartment 2', city: 'Panadura', districtOrState: 'Kalutara' };
    for (const [key, value] of [['customerCode', '0771234567'], ['customerName', 'Dialog Customer'], ...Object.entries(address)]) {
      await act(async () => {
        const input = document.getElementById(`quick-customer-${key}`);
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
    }
    await act(async () => document.querySelector('dialog form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.match(document.querySelector('dialog [role="alert"]').textContent, /Code already exists/);
    assert.equal(document.getElementById('quick-customer-customerName').value, 'Dialog Customer');
    await act(async () => document.querySelector('dialog form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(document.querySelector('dialog[open]'), null);
    assert.match(document.querySelector('.selected-customer').textContent, /Dialog Customer/);
    assert.equal(createdCustomers[1].nic, '');
    for (const [key, value] of Object.entries(address)) assert.equal(createdCustomers[1][key], value);
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F6', bubbles: true })));
    assert.equal(sales.length, 0, 'F6 never submits an empty sale');
    assert.equal(document.querySelectorAll('.billing-quick-items-list button').length, 1);
    assert.ok(document.querySelector('#billing-header-slot .billing-header'), 'Billing header moves into the application top bar');
    assert.ok(!document.querySelector('.pos-page .billing-header'), 'No duplicate blue header takes space in the billing workspace');
    assert.match(document.querySelector('#billing-header-slot').textContent, /OPEN.*2026-10-13.*ACTIVE/s);
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F1', bubbles: true })));
    assert.ok(document.activeElement === document.querySelector('[aria-label="Search billing products"]'), 'F1 focuses the product search input');
    assert.equal(document.querySelector('.billing-search-shortcut'), null);
    assert.equal(document.querySelector('.pos-product-picker h2 kbd').textContent, 'F1');
    const chip = [...document.querySelectorAll('.billing-category-chips button')].find(button => button.textContent === 'Beverages');
    assert.ok(chip, 'categories come from the catalog');
    chip.focus();
    const categoryEnter = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    await act(async () => chip.dispatchEvent(categoryEnter));
    assert.equal(categoryEnter.defaultPrevented, false, 'Enter remains available for native category button activation');
    assert.ok(document.activeElement === chip, 'Enter does not move focus away from the category button');
    if (process.env.BILLING_PREVIEW_HTML) {
      const asset = (await readdir('dist/assets')).find(file => file.endsWith('.css'));
      const styles = await readFile(`dist/assets/${asset}`, 'utf8');
      await writeFile(process.env.BILLING_PREVIEW_HTML, `<!doctype html><html><head><meta charset="UTF-8"><style>${styles} body{background:#f3f6fa;}</style></head><body>${document.querySelector('.shell').outerHTML}</body></html>`);
    }
    await act(async () => chip.click());
    assert.equal(chip.getAttribute('aria-pressed'), 'true');
    assert.match(document.querySelector('.pos-product-results').textContent, /Ceylon Tea/);
    assert.equal(document.querySelector('.pos-product-picker select').value, 'Beverages');
    await act(async () => {
      const input = document.querySelector('[aria-label="Search billing products"]');
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, 'not-a-product');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    assert.equal(document.querySelectorAll('.billing-quick-items-list button').length, 0, 'Quick Items follows the active search and category');
    assert.match(document.querySelector('.pos-product-picker').textContent, /No matching products/);
    await act(async () => document.querySelector('.pos-search-row .billing-clear-button').click());
    assert.equal(document.querySelector('.pos-product-picker select').value, 'All categories');
    assert.equal(document.querySelector('[aria-label="Search billing products"]').value, '');
    await act(async () => {
      const dropdown = document.querySelector('[aria-label="Filter billing products by category"]');
      dropdown.value = 'Beverages';
      dropdown.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.match(document.querySelector('.pos-product-results').textContent, /Ceylon Tea/);
    await act(async () => document.querySelector('.sale-type-options button[title="Wholesale price + default discount"]').click());
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(document.querySelector('[aria-label="Filter billing products by category"]').value, 'All categories', 'Changing sale type clears the previous category filter');
    await act(async () => document.querySelector('.sale-type-options button[title="Standard selling price"]').click());
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(document.querySelector('.pos-complete').disabled, true);
    globalThis.__billingUi.session = { ...globalThis.__billingUi.session, canBill: false, blockedReason: 'Register is closed' };
    await act(async () => client.invalidateQueries({ queryKey: ['pos-register-session'] }));
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(document.querySelector('.billing-register-warning').textContent, /Billing blocked.*Register is closed/s);
    assert.equal(document.querySelector('.pos-complete').disabled, true);
    await act(async () => document.querySelector('.billing-quick-items-list button').click());
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(document.querySelector('.pos-cart tbody').textContent, /Ceylon Tea/);
    document.querySelector('[aria-label="Search billing products"]').focus();
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    assert.match(document.querySelector('.pos-cart tbody').textContent, /Ceylon Tea/, 'Delete while typing preserves the cart');
    document.querySelector('.pos-cart .billing-clear-button').focus();
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Delete', bubbles: true })));
    assert.equal(document.querySelectorAll('.pos-cart tbody tr').length, 0);
    await act(async () => document.querySelector('.billing-quick-items-list button').click());
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F6', bubbles: true })));
    assert.equal(sales.length, 0, 'F6 never submits a blocked sale');
    globalThis.__billingUi.session = { ...globalThis.__billingUi.session, canBill: true, blockedReason: null };
    await act(async () => client.invalidateQueries({ queryKey: ['pos-register-session'] }));
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await act(async () => {
      const amount = document.querySelector('.payment-amount-row input');
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(amount, '100');
      amount.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await act(async () => document.querySelector('.add-payment-button').click());
    assert.equal(document.querySelector('.pos-complete').disabled, false, 'Valid cash payment enables completion');
    for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) {
      await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F6', [modifier]: true, bubbles: true })));
    }
    assert.equal(sales.length, 0, 'Modified F6 combinations do not complete a sale');
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F6', bubbles: true })));
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(sales.length, 1);
    assert.equal(sales[0].customerId, 43, 'Created customer is selected on the invoice');
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'F6', bubbles: true })));
    assert.equal(sales.length, 1, 'F6 does not resubmit from the completed receipt');
  } finally { await act(async () => root.unmount()); assert.equal(document.getElementById('billing-header-slot').children.length, 0); client.clear(); dom.window.close(); }
});
