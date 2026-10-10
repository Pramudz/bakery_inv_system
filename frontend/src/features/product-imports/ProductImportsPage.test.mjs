import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import Module from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, File: dom.window.File,
  sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true });

const compiled = await build({ entryPoints: [path.resolve('src/features/product-imports/ProductImportsPage.tsx')],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'mock-product-import-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /auth\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'mock' }));
    plugin.onResolve({ filter: /productImportsApi$/ }, () => ({ path: 'api', namespace: 'mock' }));
    plugin.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: args.path === 'auth'
      ? 'export const useAuth = () => globalThis.__productImportTest.auth;'
      : args.path === 'api' ? 'export const productImportsApi = Object.fromEntries(["template", "preview", "results", "validationReport", "confirm", "get", "history"].map(key => [key, (...args) => globalThis.__productImportTest.api[key](...args)]));'
        : '', loader: 'js' }));
  } }],
});
const compiledModule = new Module(path.resolve('src/features/product-imports/ProductImportsPage.test.bundle.cjs'));
compiledModule.filename = path.resolve('src/features/product-imports/ProductImportsPage.test.bundle.cjs');
compiledModule.paths = Module._nodeModulePaths(process.cwd());
compiledModule._compile(compiled.outputFiles[0].text, compiledModule.filename);
const { ProductImportsPage } = compiledModule.exports;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const row = { sheet: 'selling-prices', rowNumber: 2, values: { SKU: 'SKU-000001', PriceListCode: 'MY-RETAIL', UnitCode: 'PCS', CurrencyCode: 'LKR', MinimumQuantity: '1' }, sku: 'SKU-000001', action: 'REVISE', status: 'READY', details: 'Current price', oldValue: '180', newValue: '200', oldEnd: '2099-10-31', newStart: '2099-11-01' };
const batch = (status = 'PREVIEW') => ({ batchId: 4, importType: 'selling-prices', datasetId: '_MAINTENANCE', status,
  counts: { create: 0, update: 0, revise: 1, end: 0, skip: 0, error: 0 }, rows: [{ ...row, status: status === 'COMPLETED' ? 'COMPLETED' : 'READY' }] });
function setup(overrides = {}) {
  sessionStorage.clear();
  const calls = { confirm: 0, get: 0 };
  globalThis.__productImportTest = { auth: { permissions: ['PRODUCT_VIEW', 'PRODUCT_CREATE', 'PRODUCT_UPDATE'], tenant: { tenantId: '7' }, tenantUser: { userId: '3' } },
    api: { template: async () => new Blob(), preview: async () => batch(), results: async () => new Blob(), validationReport: async () => new Blob(),
      confirm: async () => { calls.confirm++; return batch('COMPLETED'); },
      get: async () => { calls.get++; return batch('COMPLETED'); },
      history: async () => ({ items: [], page: 1, limit: 20, totalCount: 0, totalPages: 1 }), ...overrides } };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = async () => React.act(async () => { root.render(React.createElement(ProductImportsPage)); });
  const close = async () => React.act(async () => { root.unmount(); host.remove(); });
  const button = (label) => [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === label);
  const choosePriceFile = async () => {
    const select = host.querySelector('#product-import-type'); select.value = 'selling-prices';
    await React.act(async () => select.dispatchEvent(new Event('change', { bubbles: true })));
    const input = host.querySelector('#product-import-file');
    const file = new File(['xlsx'], 'Prices.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await React.act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    return input;
  };
  return { host, calls, render, close, button, choosePriceFile };
}

test('all eleven import options appear and a price revision shows actual preview impact', async () => {
  const ui = setup(); await ui.render();
  assert.equal(ui.host.querySelector('#product-import-type').options.length, 11);
  await ui.choosePriceFile();
  await React.act(async () => ui.button('Validate and Preview').click());
  assert.match(ui.host.textContent, /MY-RETAIL/);
  assert.match(ui.host.textContent, /180/);
  assert.match(ui.host.textContent, /200/);
  assert.match(ui.host.textContent, /No business records have changed/);
  await ui.close();
});

test('confirmation is explicit, locks duplicate submission and preserves results after clearing the file', async () => {
  let release;
  const ui = setup({ confirm: () => { ui.calls.confirm++; return new Promise((resolve) => { release = resolve; }); } });
  await ui.render(); const input = await ui.choosePriceFile();
  await React.act(async () => ui.button('Validate and Preview').click());
  await React.act(async () => ui.button('Review and Confirm Import').click());
  assert.equal(ui.calls.confirm, 0);
  await React.act(async () => ui.button('Confirm Import').click());
  assert.equal(ui.calls.confirm, 1);
  assert.equal(ui.button('Clear All').disabled, true);
  await React.act(async () => release(batch('COMPLETED')));
  assert.match(ui.host.textContent, /Import Completed/);
  assert.equal(input.value, '');
  assert.ok(ui.button('Download Results'));
  await ui.close();
});

test('interrupted confirmation verifies server batch status before allowing another action', async () => {
  const ui = setup({ confirm: async () => { throw new TypeError('Network lost'); } });
  await ui.render(); await ui.choosePriceFile();
  await React.act(async () => ui.button('Validate and Preview').click());
  await React.act(async () => ui.button('Review and Confirm Import').click());
  await React.act(async () => ui.button('Confirm Import').click());
  assert.equal(ui.calls.get, 1);
  assert.match(ui.host.textContent, /Import Completed/);
  await ui.close();
});

test('validation report downloads before confirmation even when preview contains ERROR and SKIP rows', async () => {
  let downloads = 0;
  const createObjectURL = URL.createObjectURL;
  const revokeObjectURL = URL.revokeObjectURL;
  const click = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = () => 'blob:validation'; URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { assert.match(this.download, /Validation_4\.xlsx$/); };
  const invalid = { ...batch(), counts: { create: 0, update: 0, revise: 0, end: 0, skip: 1, error: 1 }, rows: [
    { ...row, sheet: 'identifiers', action: 'ERROR', status: 'ERROR', details: 'Primary identifier conflict' },
    { ...row, rowNumber: 3, action: 'SKIP', status: 'SKIPPED', details: 'Already present' },
  ] };
  const ui = setup({ preview: async () => invalid, validationReport: async () => { downloads++; return new Blob(); } });
  try {
    await ui.render(); await ui.choosePriceFile();
    await React.act(async () => ui.button('Validate and Preview').click());
    assert.equal(ui.button('Review and Confirm Import').disabled, true);
    await React.act(async () => ui.button('Download Validation Report').click());
    assert.equal(downloads, 1);
  } finally {
    await ui.close(); URL.createObjectURL = createObjectURL; URL.revokeObjectURL = revokeObjectURL;
    dom.window.HTMLAnchorElement.prototype.click = click;
  }
});

test('history has server paging, page sizes, total count and preserves page while viewing a batch', async () => {
  const requests = [];
  const ui = setup({ history: async (_type, page, limit) => { requests.push([page, limit]); return {
    items: [{ batchId: page + 10, datasetId: 'catalog', status: 'PREVIEW', createdAt: '2026-10-01T00:00:00Z', completedAt: null }],
    page, limit, totalCount: 67, totalPages: Math.ceil(67 / limit),
  }; } });
  await ui.render();
  assert.match(ui.host.textContent, /Page 1 of 4/);
  await React.act(async () => ui.button('Next').click());
  assert.deepEqual(requests.at(-1), [2, 20]);
  assert.match(ui.host.textContent, /Page 2 of 4/);
  await React.act(async () => ui.button('View').click());
  assert.match(ui.host.textContent, /Page 2 of 4/);
  const select = ui.host.querySelector('#product-import-history-size'); select.value = '50';
  await React.act(async () => select.dispatchEvent(new Event('change', { bubbles: true })));
  assert.deepEqual(requests.at(-1), [1, 50]);
  assert.match(ui.host.textContent, /67 total batches/);
  await ui.close();
});

test('definite confirmation validation errors remain visible and do not masquerade as network interruptions', async () => {
  const rejection = Object.assign(new Error('Only one primary identifier is allowed per product.'), { status: 400 });
  const ui = setup({ confirm: async () => { throw rejection; } });
  await ui.render(); await ui.choosePriceFile();
  await React.act(async () => ui.button('Validate and Preview').click());
  await React.act(async () => ui.button('Review and Confirm Import').click());
  await React.act(async () => ui.button('Confirm Import').click());
  assert.match(ui.host.querySelector('[role="alert"]').textContent, /Only one primary identifier/);
  assert.equal(ui.calls.get, 0);
  await ui.close();
});
