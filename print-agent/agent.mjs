import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderEscPos } from './receipt.mjs';
import { deliver } from './transports.mjs';

const configPath = resolve(process.argv[2] ?? 'agent-config.json');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const server = new URL(config.serverUrl);
if (server.protocol !== 'https:' && !(server.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(server.hostname))) throw new Error('Use HTTPS for a remote POS server.');
if (!Number.isInteger(config.profileId) || !/^[a-f0-9]{64}$/.test(config.agentToken ?? '')) throw new Error('A profileId and one-time agentToken are required.');
const statePath = resolve(config.statePath ?? `${configPath}.state.json`);
let completed = new Set();
try { completed = new Set(JSON.parse(await readFile(statePath, 'utf8'))); } catch (error) { if (error.code !== 'ENOENT') throw error; }

async function request(path, body = {}) {
  const response = await fetch(new URL(path, server), { method: 'POST', headers: { 'content-type': 'application/json', 'x-pos-print-agent-token': config.agentToken }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`POS server returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  return response.json();
}

async function remember(jobId, attempt) {
  completed.add(`${jobId}:${attempt}`);
  const tmp = `${statePath}.tmp`;
  await writeFile(tmp, JSON.stringify([...completed].slice(-10000)), { mode: 0o600 });
  await rename(tmp, statePath);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
console.log(`Bakery POS print agent running for profile ${config.profileId}.`);
for (;;) {
  try {
    const job = await request(`/pos-print/agent/${config.profileId}/claim`);
    if (!job) { await sleep(3000); continue; }
    try {
      if (!completed.has(`${job.jobId}:${job.attempt}`)) {
        await deliver(job.printer, renderEscPos(job.receipt, job.printer, job.copy));
        await remember(job.jobId, job.attempt);
      }
      await request(`/pos-print/agent/${config.profileId}/jobs/${job.jobId}/complete`, { attempt: job.attempt, success: true });
      console.log(`Print job ${job.jobId} accepted by printer transport.`);
    } catch (error) {
      console.error(`Print job ${job.jobId} failed: ${error.message}`);
      try { await request(`/pos-print/agent/${config.profileId}/jobs/${job.jobId}/complete`, { attempt: job.attempt, success: false, error: error.message }); } catch (ackError) { console.error(`Could not report print failure: ${ackError.message}`); }
    }
  } catch (error) {
    console.error(`Agent poll failed: ${error.message}`);
    await sleep(5000);
  }
}
