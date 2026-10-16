import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import Module from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { AUTH_TOKEN_KEY, AUTH_STATE_KEY } from '../features/auth/auth.types.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, {
  window: dom.window, document: dom.window.document, Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement, HTMLDialogElement: dom.window.HTMLDialogElement,
  Event: dom.window.Event, localStorage: dom.window.localStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
});
dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };

const compiled = await build({
  stdin: { contents: `export { ChangePasswordDialog } from './src/features/auth/ChangePasswordDialog';
    export { AuthProvider } from './src/features/auth/AuthContext';
    export { ProtectedRoute } from './src/features/auth/ProtectedRoute';
    export { LoginPage } from './src/features/auth/LoginPage';
    export { TenantLoginPage } from './src/features/auth/TenantLoginPage';`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{ name: 'password-api-boundary', setup(plugin) {
    plugin.onResolve({ filter: /authApi$/ }, () => ({ path: 'api', namespace: 'mock' }));
    plugin.onResolve({ filter: /\.css$/ }, () => ({ path: 'css', namespace: 'mock' }));
    plugin.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: path === 'api'
      ? 'export const changePassword = (...args) => globalThis.__changePasswordTest(...args); export const logoutSession = async () => ({}); export const platformLogin = async () => ({}); export const tenantLogin = async () => ({});' : '', loader: 'js' }));
  } }],
});
const bundle = new Module(path.resolve('src/pages/changePasswordDialog.bundle.cjs'));
bundle.filename = path.resolve('src/pages/changePasswordDialog.bundle.cjs');
bundle.paths = Module._nodeModulePaths(process.cwd());
bundle._compile(compiled.outputFiles[0].text, bundle.filename);
const { ChangePasswordDialog, AuthProvider, ProtectedRoute, LoginPage, TenantLoginPage } = bundle.exports;
const { createElement: h, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createMemoryRouter, RouterProvider } = await import('react-router-dom');

async function setup(scope, api) {
  localStorage.clear();
  localStorage.setItem(AUTH_TOKEN_KEY, 'test-token');
  localStorage.setItem(AUTH_STATE_KEY, JSON.stringify({ accessToken: 'test-token', scope, expiresAt: new Date(Date.now() + 60000).toISOString() }));
  globalThis.__changePasswordTest = api;
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const router = createMemoryRouter([
    { path: '/', element: h(ProtectedRoute), children: [{ index: true, element: h(ChangePasswordDialog, { accountName: 'Test User', onClose: () => {} }) }] },
    { path: '/login', element: h(LoginPage) },
    { path: '/tenant-login', element: h(TenantLoginPage) },
  ]);
  await act(async () => root.render(h(AuthProvider, null, h(RouterProvider, { router }))));
  const fill = async (key, value) => {
    const input = container.querySelector(`#change-${key}`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  return { container, router, fill, close: async () => { await act(async () => root.unmount()); router.dispose(); container.remove(); } };
}

for (const scope of ['PLATFORM', 'TENANT']) {
  test(`${scope} password dialog submits all fields and returns to its own login with confirmation`, async () => {
    const calls = [];
    const f = await setup(scope, async (...args) => { calls.push(args); return { message: 'Changed' }; });
    try {
      assert.equal(f.container.querySelectorAll('input[type="password"]').length, 3);
      await f.fill('currentPassword', 'PreviousPass123!');
      await f.fill('newPassword', 'UpdatedPass456!');
      await f.fill('confirmPassword', 'UpdatedPass456!');
      await act(async () => f.container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      assert.deepEqual(calls, [[scope, { currentPassword: 'PreviousPass123!', newPassword: 'UpdatedPass456!', confirmPassword: 'UpdatedPass456!' }]]);
      assert.equal(f.router.state.location.pathname, scope === 'TENANT' ? '/tenant-login' : '/login');
      assert.match(f.container.textContent, /Password changed successfully/);
      assert.equal(localStorage.getItem(AUTH_TOKEN_KEY), null);
    } finally { await f.close(); }
  });
}

test('wrong current password stays in the dialog, keeps the session and allows another attempt', async () => {
  const f = await setup('TENANT', async () => { throw new Error('Current password is incorrect.'); });
  try {
    await f.fill('currentPassword', 'IncorrectPass123!');
    await f.fill('newPassword', 'UpdatedPass456!');
    await f.fill('confirmPassword', 'UpdatedPass456!');
    await act(async () => f.container.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    assert.match(f.container.querySelector('[role="alert"]').textContent, /Current password is incorrect/);
    assert.equal(f.router.state.location.pathname, '/');
    assert.equal(localStorage.getItem(AUTH_TOKEN_KEY), 'test-token');
    assert.equal(f.container.querySelector('button[type="submit"]').disabled, false);
    const show = f.container.querySelector('[aria-label="Show current password"]');
    await act(async () => show.click());
    assert.equal(f.container.querySelector('#change-currentPassword').type, 'text');
  } finally { await f.close(); }
});
