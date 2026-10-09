import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import Module from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document,
  HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, File: dom.window.File,
  sessionStorage: dom.window.sessionStorage, IS_REACT_ACT_ENVIRONMENT: true,
});

const compiled = await build({
  entryPoints: [path.resolve('src/features/reference-imports/ReferenceImportsPage.tsx')],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'mock-import-boundaries', setup(plugin) {
    plugin.onResolve({ filter: /auth\/AuthContext$/ }, () => ({ path: 'auth', namespace: 'mock' }));
    plugin.onResolve({ filter: /referenceImportsApi$/ }, () => ({ path: 'api', namespace: 'mock' }));
    plugin.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({ contents: args.path === 'auth'
      ? 'export const useAuth = () => globalThis.__referenceImportTest.auth;'
      : args.path === 'api' ? 'export const referenceImportsApi = Object.fromEntries(["template", "preview", "results", "confirm", "get"].map(key => [key, (...args) => globalThis.__referenceImportTest.api[key](...args)]));'
        : '', loader: 'js' }));
  } }],
});
const compiledModule = new Module(path.resolve('src/features/reference-imports/ReferenceImportsPage.test.bundle.cjs'));
compiledModule.filename = path.resolve('src/features/reference-imports/ReferenceImportsPage.test.bundle.cjs');
compiledModule.paths = Module._nodeModulePaths(process.cwd());
compiledModule._compile(compiled.outputFiles[0].text, compiledModule.filename);
const { ReferenceImportsPage } = compiledModule.exports;
const React = await import('react');
const { createRoot } = await import('react-dom/client');

const keys = ['categories', 'brands', 'units', 'suppliers', 'price-lists', 'locations'];
const permissions = ['CATEGORY', 'BRAND', 'UNIT', 'SUPPLIER', 'PRICE_LIST', 'LOCATION'].flatMap((name) => [`${name}_VIEW`, `${name}_CREATE`]);
const row = { rowNumber: 2, action: 'CREATE', code: 'BAKERY', errors: [], details: '', values: { categoryName: 'Bakery' } };
const batch = (status = 'PREVIEW') => ({ batchId: 17, master: 'categories', status, counts: { create: 1, skip: 0, error: 0 }, rows: [row] });
function setup(api = {}) {
  dom.window.sessionStorage.clear();
  const calls = { confirm: 0, get: 0 };
  globalThis.__referenceImportTest = {
    auth: { permissions, tenant: { tenantId: '7' }, tenantUser: { userId: '3' } },
    api: {
      template: async () => new Blob(), preview: async (master) => ({ ...batch(), master }), results: async () => new Blob(),
      confirm: async () => { calls.confirm++; return batch('COMPLETED'); },
      get: async () => { calls.get++; return batch('COMPLETED'); },
      ...api,
    },
  };
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  const render = async () => React.act(async () => { root.render(React.createElement(ReferenceImportsPage)); });
  const close = async () => React.act(async () => { root.unmount(); host.remove(); });
  const button = (name) => [...host.querySelectorAll('button')].find((item) => item.textContent.trim() === name);
  const chooseFile = async () => {
    const input = host.querySelector('#import-file');
    const file = new File(['test'], 'Categories.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    await React.act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    return input;
  };
  return { calls, host, root, render, close, button, chooseFile };
}

test('all six masters appear; switching and Clear All remove stale preview and supplier guidance', async () => {
  const ui = setup(); await ui.render();
  const select = ui.host.querySelector('#import-master');
  assert.deepEqual([...select.options].map((option) => option.value), keys);
  select.value = 'suppliers';
  await React.act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.match(ui.host.textContent, /Supplier Reference \(S001, S002, S003\)/);
  await ui.chooseFile();
  await React.act(async () => { ui.button('Validate and Preview').click(); });
  assert.match(ui.host.textContent, /Validation Preview/);
  await React.act(async () => { ui.button('Clear All').click(); });
  assert.doesNotMatch(ui.host.textContent, /Validation Preview/);
  assert.equal(ui.host.querySelector('#import-file').value, '');
  await ui.chooseFile();
  await React.act(async () => { ui.button('Validate and Preview').click(); });
  select.value = 'brands';
  await React.act(async () => { select.dispatchEvent(new Event('change', { bubbles: true })); });
  assert.doesNotMatch(ui.host.textContent, /Validation Preview/);
  assert.equal(ui.host.querySelector('#import-file').value, '');
  await ui.close();
});

test('confirmation is explicit, in flight clicks are locked, and completion resets the file', async () => {
  let resolveConfirm;
  const ui = setup({ confirm: () => { ui.calls.confirm++; return new Promise((resolve) => { resolveConfirm = resolve; }); } });
  await ui.render(); const input = await ui.chooseFile();
  await React.act(async () => { ui.button('Validate and Preview').click(); });
  assert.match(ui.host.textContent, /No records have been imported yet/);
  await React.act(async () => { ui.button('Review and Confirm Import').click(); });
  assert.match(ui.host.textContent, /Are you sure you want to import these records/);
  await React.act(async () => { ui.button('Confirm Import').click(); });
  assert.equal(ui.calls.confirm, 1);
  assert.match(ui.host.textContent, /Importing records — please wait/);
  assert.equal(ui.button('Clear All').disabled, true);
  assert.equal(ui.button('Review and Confirm Import').disabled, true);
  await React.act(async () => { resolveConfirm(batch('COMPLETED')); });
  assert.match(ui.host.textContent, /Import Completed/);
  assert.equal(input.value, '');
  assert.equal(ui.button('Review and Confirm Import'), undefined);
  assert.ok(ui.button('Download Results'));
  await ui.close();
});

test('interrupted confirmation reads batch status and refresh restores completed results', async () => {
  const ui = setup({ confirm: async () => { throw new TypeError('Network lost'); } });
  await ui.render(); await ui.chooseFile();
  await React.act(async () => { ui.button('Validate and Preview').click(); });
  await React.act(async () => { ui.button('Review and Confirm Import').click(); });
  await React.act(async () => { ui.button('Confirm Import').click(); });
  assert.equal(ui.calls.get, 1);
  assert.match(ui.host.textContent, /Import Completed/);
  await ui.close();
  const restored = setup();
  dom.window.sessionStorage.setItem('reference-import:7:3', JSON.stringify({ master: 'categories', batchId: 17, fileName: 'Categories.xlsx' }));
  await restored.render();
  assert.equal(restored.calls.get, 1);
  assert.match(restored.host.textContent, /Import Completed/);
  await restored.close();
});

test('unverifiable confirmation stays locked until status is checked successfully', async () => {
  let reachable = false;
  const ui = setup({
    confirm: async () => { throw new TypeError('Network lost'); },
    get: async () => { ui.calls.get++; if (!reachable) throw new TypeError('Offline'); return batch(); },
  });
  await ui.render(); await ui.chooseFile();
  await React.act(async () => { ui.button('Validate and Preview').click(); });
  await React.act(async () => { ui.button('Review and Confirm Import').click(); });
  await React.act(async () => { ui.button('Confirm Import').click(); });
  assert.equal(ui.button('Review and Confirm Import').disabled, true);
  assert.ok(ui.button('Check Batch Status'));
  reachable = true;
  await React.act(async () => { ui.button('Check Batch Status').click(); });
  assert.equal(ui.button('Review and Confirm Import').disabled, false);
  await ui.close();
});
