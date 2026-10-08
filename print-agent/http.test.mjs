import test from 'node:test';
import assert from 'node:assert/strict';
import { agentEndpoint, agentRequest } from './http.mjs';

test('agent keeps and normalizes the configured API base path', () => {
  assert.equal(String(agentEndpoint('http://localhost:3000//api//', '/pos-print/agent/2/claim')), 'http://localhost:3000/api/pos-print/agent/2/claim');
  assert.equal(String(agentEndpoint('http://localhost:3000/api', '/pos-print/agent/2/claim')), 'http://localhost:3000/api/pos-print/agent/2/claim');
});

test('idle empty and 204 polls return null with agent authentication', async () => {
  for (const status of [200, 204]) {
    let requested;
    const result = await agentRequest('http://localhost:3000/api', 'secret', '/pos-print/agent/2/claim', {}, async (url, options) => {
      requested = { url: String(url), options };
      return { ok: true, status, text: async () => '' };
    });
    assert.equal(result, null);
    assert.equal(requested.url, 'http://localhost:3000/api/pos-print/agent/2/claim');
    assert.equal(requested.options.headers['x-pos-print-agent-token'], 'secret');
  }
});
