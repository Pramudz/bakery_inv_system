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
const compiled = await build({ entryPoints: [path.resolve('src/features/opening-inventory-imports/OpeningInventoryImportsPage.tsx')],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'mock-opening-import-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /auth\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'mock' }));
    plugin.onResolve({ filter: /openingInventoryImportsApi$/ }, () => ({ path: 'api', namespace: 'mock' }));
    plugin.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'auth'
      ? 'export const useAuth = () => globalThis.__openingTest.auth;'
      : args.path === 'api' ? 'export const openingInventoryImportsApi = Object.fromEntries(["template","preview","results","validationReport","confirm","get","history"].map(key => [key, (...args) => globalThis.__openingTest.api[key](...args)]));'
        : '', loader: 'js' }));
  } }],
});
const compiledModule = new Module(path.resolve('src/features/opening-inventory-imports/OpeningInventoryImportsPage.test.bundle.cjs'));
compiledModule.filename = path.resolve('src/features/opening-inventory-imports/OpeningInventoryImportsPage.test.bundle.cjs');
compiledModule.paths = Module._nodeModulePaths(process.cwd());
compiledModule._compile(compiled.outputFiles[0].text, compiledModule.filename);
const { OpeningInventoryImportsPage } = compiledModule.exports;
const React = await import('react');
const { createRoot } = await import('react-dom/client');
const sourceRow = { rowNumber: 2, values: { LocationCode: 'MAIN', SKU: 'SKU-1', UnitCode: 'EA', Quantity: '2',
  BaseUnitCost: '3.2500', Remarks: '', RowReference: 'R1' }, status: 'READY', details: 'Ready to post.',
  productName: 'Flour', conversionFactor: '1.000000', baseUnitCode: 'EA', baseQuantity: '2.0000', openingValue: '6.5000',
  existingQuantity: '0.0000', existingWavg: '0.0000', historicalMovement: false, openingClaim: false };
const batch = (status = 'PREVIEW', errorRows = 0) => ({ batchId: 4, datasetId: 'opening-2026', status,
  summary: { totalRows: 1, readyRows: status === 'PREVIEW' && !errorRows ? 1 : 0, errorRows,
    postedRows: status === 'COMPLETED' ? 1 : 0, locationsAffected: 1, baseQuantitiesByUnit: { EA: '2.0000' }, totalOpeningValue: '6.5000' },
  rows: [{ ...sourceRow, status: errorRows ? 'ERROR' : status === 'COMPLETED' ? 'POSTED' : 'READY',
    details: errorRows ? 'Prior inventory movement exists.' : sourceRow.details,
    ...(status === 'COMPLETED' ? { postingDate: '2026-10-10', adjustmentNumber: 'ADJ-001', ledgerId: 100 } : {}) }] });
function setup(overrides = {}) {
  sessionStorage.clear();
  const calls = { confirm: 0, get: 0, template: [], validation: 0, results: 0, history: [] };
  globalThis.__openingTest = { auth: { permissions: ['INVENTORY_ADJUSTMENT_VIEW', 'INVENTORY_ADJUSTMENT_CREATE',
    'INVENTORY_ADJUSTMENT_POST', 'INVENTORY_OPENING_POST'], tenant: { tenantId: 7 }, tenantUser: { userId: 9 } },
    api: { template: async sample => { calls.template.push(sample); return new Blob(); }, preview: async () => batch(),
      validationReport: async () => { calls.validation++; return new Blob(); },
      results: async () => { calls.results++; return new Blob(); },
      confirm: async () => { calls.confirm++; return batch('COMPLETED'); },
      get: async () => { calls.get++; return batch('COMPLETED'); },
      history: async (page, limit) => { calls.history.push([page, limit]); return { items: [], page, limit, totalCount: 0, totalPages: 1 }; },
      ...overrides } };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = async () => React.act(async () => { root.render(React.createElement(OpeningInventoryImportsPage)); });
  const close = async () => React.act(async () => { root.unmount(); host.remove(); });
  const button = label => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  const chooseFile = async () => {
    const dataset = host.querySelector('#opening-dataset');
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(dataset, 'opening-2026');
    await React.act(async () => dataset.dispatchEvent(new Event('input', { bubbles: true })));
    const input = host.querySelector('#opening-file');
    const file = new File(['xlsx'], 'Opening.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await React.act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    return input;
  };
  return { host, calls, render, close, button, chooseFile };
}

test('template buttons download blank and sample files, and preview shows conversion, WAVG and history', async () => {
  const original = URL.createObjectURL, revoke = URL.revokeObjectURL, click = dom.window.HTMLAnchorElement.prototype.click;
  URL.createObjectURL = () => 'blob:test'; URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = () => {};
  const ui = setup();
  try {
    await ui.render();
    await React.act(async () => ui.button('Download Blank Template').click());
    await React.act(async () => ui.button('Download Sample Excel').click());
    assert.deepEqual(ui.calls.template, [false, true]);
    await ui.chooseFile();
    await React.act(async () => ui.button('Validate and Preview').click());
    assert.match(ui.host.textContent, /Flour/); assert.match(ui.host.textContent, /6.5000/);
    assert.match(ui.host.textContent, /No inventory has changed/);
    await React.act(async () => ui.button('Download Validation Report').click());
    assert.equal(ui.calls.validation, 1);
  } finally {
    await ui.close(); URL.createObjectURL = original; URL.revokeObjectURL = revoke;
    dom.window.HTMLAnchorElement.prototype.click = click;
  }
});

test('confirmation needs a dialog, disables repeated submission, then exposes results', async () => {
  let release;
  const ui = setup({ confirm: () => { ui.calls.confirm++; return new Promise(resolve => { release = resolve; }); } });
  await ui.render(); const input = await ui.chooseFile();
  await React.act(async () => ui.button('Validate and Preview').click());
  await React.act(async () => ui.button('Review and Confirm Import').click());
  assert.equal(ui.calls.confirm, 0);
  await React.act(async () => ui.button('Confirm Import').click());
  assert.equal(ui.calls.confirm, 1); assert.equal(ui.button('Clear All').disabled, true);
  await React.act(async () => release(batch('COMPLETED')));
  assert.match(ui.host.textContent, /Import Completed/);
  assert.equal(input.value, ''); assert.ok(ui.button('Download Results'));
  await ui.close();
});

test('errors block confirmation while validation remains downloadable', async () => {
  const ui = setup({ preview: async () => batch('PREVIEW', 1) });
  await ui.render(); await ui.chooseFile();
  await React.act(async () => ui.button('Validate and Preview').click());
  assert.equal(ui.button('Review and Confirm Import').disabled, true);
  assert.match(ui.host.textContent, /Prior inventory movement/);
  assert.ok(ui.button('Download Validation Report'));
  await ui.close();
});

test('network interruption checks committed status and definite server errors remain visible', async () => {
  const interrupted = setup({ confirm: async () => { throw new TypeError('Network lost'); } });
  await interrupted.render(); await interrupted.chooseFile();
  await React.act(async () => interrupted.button('Validate and Preview').click());
  await React.act(async () => interrupted.button('Review and Confirm Import').click());
  await React.act(async () => interrupted.button('Confirm Import').click());
  assert.equal(interrupted.calls.get, 1); assert.match(interrupted.host.textContent, /Import Completed/);
  await interrupted.close();
  const rejected = setup({ confirm: async () => { throw Object.assign(new Error('Preview is stale'), { status: 409 }); } });
  await rejected.render(); await rejected.chooseFile();
  await React.act(async () => rejected.button('Validate and Preview').click());
  await React.act(async () => rejected.button('Review and Confirm Import').click());
  await React.act(async () => rejected.button('Confirm Import').click());
  assert.match(rejected.host.querySelector('[role="alert"]').textContent, /Preview is stale/);
  assert.equal(rejected.calls.get, 0);
  await rejected.close();
});

test('history supports server pagination, page size changes, and opening a prior batch', async () => {
  const ui = setup({ history: async (page, limit) => { ui.calls.history.push([page, limit]); return {
    items: [{ batchId: page + 10, datasetId: 'opening-2026', status: 'PREVIEW', createdAt: '2026-10-01T00:00:00Z', completedAt: null }],
    page, limit, totalCount: 67, totalPages: Math.ceil(67 / limit),
  }; } });
  await ui.render();
  await React.act(async () => ui.button('Next').click());
  assert.deepEqual(ui.calls.history.at(-1), [2, 20]);
  await React.act(async () => ui.button('View').click());
  assert.match(ui.host.textContent, /Import Completed/);
  const size = ui.host.querySelector('#opening-history-size'); size.value = '50';
  await React.act(async () => size.dispatchEvent(new Event('change', { bubbles: true })));
  assert.deepEqual(ui.calls.history.at(-1), [1, 50]);
  await ui.close();
});
