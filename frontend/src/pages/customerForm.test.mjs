import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', { url: 'http://localhost/' });
for (const key of ['window', 'document', 'localStorage', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { QueryClient, QueryClientProvider } = createRequire(import.meta.url)('@tanstack/react-query');
const compiled = await build({
  entryPoints: [path.resolve('src/features/customers/pages/CustomersPage.tsx')], bundle: true, write: false,
  platform: 'node', format: 'cjs', packages: 'external',
  plugins: [{ name: 'customer-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /\/(AuthContext|customersApi)$/ }, ({ path }) => ({ path: path.split('/').pop(), namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ loader: 'js', contents: path === 'AuthContext'
      ? 'export const useAuth = () => ({permissions: ["CUSTOMER_CREATE", "CUSTOMER_UPDATE"]});'
      : 'export const customersApi = globalThis.__customerFormApi;' }));
  } }],
});

test('customer form saves optional NIC and omits removed contact fields from updates', async () => {
  const customer = { customerId: 42, customerCode: '0771234567', customerName: 'Customer', isActive: true, nic: null, contactName: 'Existing contact', phone: '0112345678' };
  const updates = [];
  globalThis.__customerFormApi = {
    page: async () => ({ items: [customer], total: 1, totalPages: 1 }), get: async () => customer,
    update: async (id, body) => { updates.push({ id, body }); return { ...customer, ...body }; },
    create: async body => { updates.push({ body }); return { ...body, customerId: 43 }; },
  };
  const bundle = new Module(path.resolve('src/pages/customerForm.bundle.cjs'));
  bundle.filename = path.resolve('src/pages/customerForm.bundle.cjs');
  bundle.paths = Module._nodeModulePaths(process.cwd());
  bundle._compile(compiled.outputFiles[0].text, bundle.filename);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const root = createRoot(document.getElementById('app'));
  const settle = async () => { for (let i = 0; i < 3; i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); };
  const field = name => [...document.querySelectorAll('.modal .field')].find(element => element.querySelector('label').textContent.replace('*', '').trim() === name)?.querySelector('input');
  const fill = async (input, value) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  try {
    await act(async () => root.render(h(QueryClientProvider, { client }, h(bundle.exports.CustomersPage))));
    await settle();
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Edit').click());
    await settle();
    assert.ok(field('NIC'));
    assert.equal(field('NIC').required, false);
    assert.equal(field('Contact name'), undefined);
    assert.equal(field('Phone'), undefined);
    await fill(field('NIC'), '123456789V');
    await act(async () => document.querySelector('.modal form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    assert.equal(updates[0].id, 42);
    assert.equal(updates[0].body.nic, '123456789V');
    assert.ok(!('contactName' in updates[0].body));
    assert.ok(!('phone' in updates[0].body));
    await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === '+ New customer').click());
    await fill(field('Code'), '0779876543');
    await fill(field('Name'), 'New customer');
    await act(async () => document.querySelector('.modal form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await settle();
    assert.equal(updates[1].body.nic, '');
  } finally { await act(async () => root.unmount()); client.clear(); dom.window.close(); }
});
