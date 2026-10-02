import net from 'node:net';
import { spawn } from 'node:child_process';
import { writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export function tcpPrint(printer, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: printer.target, port: printer.port });
    socket.setTimeout(10000);
    socket.once('error', reject);
    socket.once('timeout', () => socket.destroy(new Error('Printer connection timed out.')));
    socket.once('connect', () => socket.end(bytes));
    socket.once('close', (hadError) => { if (!hadError) resolve(); });
  });
}

export async function windowsQueuePrint(printer, bytes) {
  if (process.platform !== 'win32') throw new Error('WINDOWS_QUEUE transport requires Windows.');
  const path = join(tmpdir(), `bakery-pos-${randomUUID()}.bin`);
  await writeFile(path, bytes, { flag: 'wx' });
  try {
    await new Promise((resolve, reject) => {
      const script = join(dirname(fileURLToPath(import.meta.url)), 'windows-raw-print.ps1');
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-Queue', printer.target, '-File', path], { windowsHide: true });
      let errors = '';
      child.stderr.on('data', (chunk) => { errors += chunk.toString(); });
      child.on('error', reject);
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(errors || `Windows queue returned ${code}`)));
    });
  } finally { await unlink(path).catch(() => undefined); }
}

export async function deliver(printer, bytes, adapters = { TCP: tcpPrint, WINDOWS_QUEUE: windowsQueuePrint }) {
  const adapter = adapters[printer.transport];
  if (!adapter) throw new Error('Unsupported print transport.');
  return adapter(printer, bytes);
}
