
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { renderEscPos } from './receipt.mjs';
import { deliver } from './transports.mjs';
import { agentRequest } from './http.mjs';

const configPath = resolve(process.argv[2] ?? 'agent-config.json');

let config;

try {
  config = JSON.parse(await readFile(configPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;

  console.error(
    'Print Agent is not configured.\n' +
    'Copy agent-config.example.json to agent-config.json ' +
    'and configure this workstation.'
  );

  process.exit(1);
}

if (!config.serverUrl) {
  console.error(
    'Print Agent configuration is incomplete. ' +
    'Set serverUrl in agent-config.json.'
  );

  process.exit(1);
}

const server = new URL(config.serverUrl);

if (
  server.protocol !== 'https:' &&
  !(
    server.protocol === 'http:' &&
    ['localhost', '127.0.0.1'].includes(server.hostname)
  )
) {
  throw new Error('Use HTTPS for a remote POS server.');
}

if (
  !Number.isInteger(config.profileId) ||
  !/^[a-f0-9]{64}$/.test(config.agentToken ?? '')
) {
  throw new Error('A profileId and agent credential are required.');
}

const statePath = resolve(
  config.statePath ?? `${configPath}.state.json`
);

let completed = new Set();

try {
  completed = new Set(
    JSON.parse(await readFile(statePath, 'utf8'))
  );
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

async function request(path, body = {}) {
  return agentRequest(server, config.agentToken, path, body);
}

async function remember(jobId, attempt) {
  completed.add(`${jobId}:${attempt}`);

  const tmp = `${statePath}.tmp`;

  await writeFile(
    tmp,
    JSON.stringify([...completed].slice(-10000)),
    { mode: 0o600 }
  );

  await rename(tmp, statePath);
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

console.log(
  `Bakery POS print agent running for profile ${config.profileId}.`
);

for (;;) {
  try {
    const job = await request(
      `/pos-print/agent/${config.profileId}/claim`
    );

    if (!job) {
      await sleep(3000);
      continue;
    }

    try {
      if (!completed.has(`${job.jobId}:${job.attempt}`)) {
        const printer = config.testOutputDir
          ? {
              ...job.printer,
              transport: 'FILE',
              target: resolve(config.testOutputDir),
              documentType: job.receipt?.documentType
            }
          : job.printer;

        // Diagnostic: display the actual print destination.
        console.log(
          'PRINT DESTINATION:',
          printer.transport,
          '| TARGET:',
          printer.target
        );

        await deliver(
          printer,
          renderEscPos(job.receipt, printer, job.copy)
        );

        await remember(job.jobId, job.attempt);
      }

      await request(
        `/pos-print/agent/${config.profileId}/jobs/${job.jobId}/complete`,
        {
          attempt: job.attempt,
          success: true
        }
      );

      console.log(
        `Print job ${job.jobId} accepted by printer transport.`
      );

    } catch (error) {
      console.error(
        `Print job ${job.jobId} failed: ${error.message}`
      );

      try {
        await request(
          `/pos-print/agent/${config.profileId}/jobs/${job.jobId}/complete`,
          {
            attempt: job.attempt,
            success: false,
            error: error.message
          }
        );
      } catch (ackError) {
        console.error(
          `Could not report print failure: ${ackError.message}`
        );
      }
    }
  } catch (error) {
    console.error(`Agent poll failed: ${error.message}`);
    await sleep(5000);
  }
}
