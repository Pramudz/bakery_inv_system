import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentConfig } from '../../pos-registers/pages/agentConfig.ts';

test('generated workstation config uses selected profile and API base without printer target', () => {
  const config = JSON.parse(buildAgentConfig('https://erp.example.com//api/api/', 'https://erp.example.com', 42, 'credential'));
  assert.deepEqual(config, { serverUrl: 'https://erp.example.com/api', profileId: 42, agentToken: 'credential', statePath: 'agent-state.json' });
  assert.equal(JSON.parse(buildAgentConfig('/api', 'https://erp.example.com', 7, 'secret')).serverUrl, 'https://erp.example.com/api');
  assert.equal('testOutputDir' in config, false);
  assert.equal('target' in config, false);
});
