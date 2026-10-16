import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

if (process.platform !== 'win32') throw new Error('Windows EXE test requires Windows.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const exe = join(root, 'release', `bakery-pos-print-agent-${version}-win-x64`, 'ProsincPrintAgent.exe');
const run = (command, args) => JSON.parse(execFileSync(command, args, { encoding: 'utf8', cwd: dirname(root) }).trim());
const node = run(process.execPath, [join(root, 'agent.mjs'), '--self-test']);
const packaged = run(exe, ['--self-test']);
assert.equal(node.mode, 'node');
assert.equal(packaged.mode, 'exe');
assert.equal(packaged.version, version);
assert.equal(node.receiptSha256, packaged.receiptSha256);
assert.equal(node.configPath, join(root, 'agent-config.json'));
assert.equal(packaged.configPath, join(dirname(exe), 'agent-config.json'));
for (const result of [node, packaged]) {
  assert.equal(result.statePath, `${result.configPath}.state.json`);
  assert.equal(result.logPath, join(dirname(result.configPath), 'agent.log'));
}
console.log('Node and Windows EXE self-tests passed; receipt bytes match.');

async function exercise(command, prefix, name, documentType = 'SALE') {
  const directory = join(root, 'dist', 'test-runs', `${name}-${randomUUID()}`);
  const output = join(directory, 'output');
  await mkdir(output, { recursive: true });
  const token = 'a'.repeat(64);
  let claims = 0;
  let complete;
  const completed = new Promise((resolveCompletion) => { complete = resolveCompletion; });
  const saleReceipt = { documentType: 'SALE', billNo: 1, header: { companyName: 'Bakery' },
    details: [{ quantity: 1, unitPrice: 100, discountAmount: 0, netTotal: 100,
      product: { productName: 'Test item' } }], grandTotal: 100 };
  const receipt = documentType === 'SALE' ? saleReceipt : { documentType: 'PAYMENT_COLLECTION',
    paymentReceiptNumber: 'PAY-000007', issuedAt: '2026-10-08T00:04:00.000Z',
    header: { companyName: 'Bakery', timeZone: 'Asia/Colombo' }, originalInvoiceTotal: '100',
    balanceBefore: '100', tenderedAmount: '50', amount: '50', changeAmount: '0', balanceAfter: '50' };
  const server = createServer((request, response) => {
    assert.equal(request.headers['x-pos-print-agent-token'], token);
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/pos-print/agent/1/claim') {
      claims += 1;
      response.end(JSON.stringify(claims === 1 ? { jobId: 7, attempt: 1, copy: false, receipt,
        printer: { paperWidth: 80, encoding: 'CP437', cutEnabled: true, transport: 'TCP', target: '127.0.0.1', port: 9100 } } : null));
    } else if (request.url === '/api/pos-print/agent/1/jobs/7/complete') {
      let body = '';
      request.on('data', (chunk) => { body += chunk; });
      request.on('end', () => {
        complete(JSON.parse(body));
        response.end('{"status":"PRINTED"}');
      });
    } else {
      response.statusCode = 404;
      response.end('{}');
    }
  });
  await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const config = join(directory, 'agent-config.json');
  await writeFile(config, JSON.stringify({ serverUrl: `http://127.0.0.1:${server.address().port}/api`,
    profileId: 1, agentToken: token, statePath: 'state.json', logPath: 'agent.log', testOutputDir: output }));
  const child = spawn(command, [...prefix, config], { cwd: dirname(root), windowsHide: true, stdio: 'ignore' });
  let timer;
  try {
    const result = await Promise.race([completed, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} did not complete its print job`)), 12000);
    })]);
    assert.deepEqual(result, { attempt: 1, success: true });
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')), ['7:1']);
    assert.ok((await readdir(output)).some((file) => file.startsWith(`${documentType.toLowerCase()}-`) && file.endsWith('.bin')));
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    assert.match(await readFile(join(directory, 'agent.log'), 'utf8'), /Print job 7 accepted by printer transport/);
  } finally {
    clearTimeout(timer);
    child.kill();
    server.close();
  }
}

await exercise(process.execPath, [join(root, 'agent.mjs')], 'node');
await exercise(exe, [], 'exe');
await exercise(process.execPath, [join(root, 'agent.mjs')], 'node-collection', 'PAYMENT_COLLECTION');
await exercise(exe, [], 'exe-collection', 'PAYMENT_COLLECTION');
console.log('Node and Windows EXE polling, file transport, acknowledgment, state, and log tests passed.');
