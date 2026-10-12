
import { readFile, writeFile, rename, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { isSea } from 'node:sea';
import { agentPaths } from './runtime-paths.mjs';
import { renderEscPos } from './receipt.mjs';
import { deliver } from './transports.mjs';
import { agentRequest } from './http.mjs';

async function main() {
const paths = agentPaths();
const configPath = paths.configPath;
const version = typeof __AGENT_VERSION__ === 'undefined' ? 'development' : __AGENT_VERSION__;
if (process.argv.includes('--version')) {
  console.log(version);
  return;
}
if (process.argv.includes('--self-test')) {
  await access(paths.windowsPrintScript);
  const receipt = { documentType: 'SALE', billNo: 1, header: { companyName: 'Bakery' },
    details: [{ quantity: 2, unitPrice: 100, discountAmount: 0, netTotal: 200,
      product: { sku: 'TEST', productName: 'Test item' } }], grandTotal: 200 };
  const bytes = renderEscPos(receipt, { paperWidth: 80, encoding: 'CP437', cutEnabled: true });
  console.log(JSON.stringify({ version, mode: isSea() ? 'exe' : 'node',
    receiptSha256: createHash('sha256').update(bytes).digest('hex'),
    configPath, statePath: paths.statePath({}), logPath: paths.logPath({}) }));
  return;
}

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

const statePath = paths.statePath(config);
const logStream = createWriteStream(paths.logPath(config), { flags: 'a' });
logStream.on('error', (error) => console.error(`Print Agent log failed: ${error.message}`));
const log = (...parts) => {
  console.log(...parts);
  logStream.write(`${new Date().toISOString()} ${parts.join(' ')}\n`);
};
const logError = (...parts) => {
  console.error(...parts);
  logStream.write(`${new Date().toISOString()} ERROR ${parts.join(' ')}\n`);
};

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

log(
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
              target: paths.dataPath(config.testOutputDir),
              documentType: job.receipt?.documentType
            }
          : job.printer;

        // Diagnostic: display the actual print destination.
        log(
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

      log(
        `Print job ${job.jobId} accepted by printer transport.`
      );

    } catch (error) {
      logError(
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
        logError(
          `Could not report print failure: ${ackError.message}`
        );
      }
    }
  } catch (error) {
    logError(`Agent poll failed: ${error.message}`);
    await sleep(5000);
  }
}
}

main().catch((error) => {
  console.error(`Print Agent stopped: ${error.stack ?? error.message}`);
  process.exitCode = 1;
});
