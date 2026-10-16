import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { agentPaths } from './runtime-paths.mjs';

test('Node and SEA use their own folder for default config and Windows helper', () => {
  const node = agentPaths(undefined, { entry: join('source', 'agent.mjs'), packaged: false });
  const sea = agentPaths(undefined, { executable: join(resolve('release'), 'agent.exe'), packaged: true });
  assert.equal(node.configPath, join(resolve('source'), 'agent-config.json'));
  assert.equal(sea.configPath, join(resolve('release'), 'agent-config.json'));
  assert.equal(sea.windowsPrintScript, join(dirname(sea.configPath), 'windows-raw-print.ps1'));
});

test('state and log paths resolve beside an explicit external config', () => {
  const paths = agentPaths(join('config', 'pc-01.json'));
  const base = dirname(paths.configPath);
  assert.equal(paths.statePath({}), `${paths.configPath}.state.json`);
  assert.equal(paths.statePath({ statePath: 'print-state.json' }), join(base, 'print-state.json'));
  assert.equal(paths.logPath({ logPath: 'agent.log' }), join(base, 'agent.log'));
});
