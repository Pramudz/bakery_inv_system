import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Build the Windows x64 release on a Windows x64 machine.');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const work = join(root, 'dist', 'sea');
const release = join(root, 'release', `bakery-pos-print-agent-${version}-win-x64`);
await mkdir(work, { recursive: true });
await mkdir(release, { recursive: true });

const bundle = join(work, 'agent.cjs');
const blob = join(work, 'agent.blob');
const executable = join(release, 'ProsincPrintAgent.exe');
await rm(join(release, 'bakery-pos-print-agent.exe'), { force: true });
await build({
  entryPoints: [join(root, 'agent.mjs')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  define: { __AGENT_VERSION__: JSON.stringify(version) },
});
await writeFile(join(work, 'sea-config.json'), JSON.stringify({
  main: bundle,
  output: blob,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
}, null, 2));
execFileSync(process.execPath, ['--experimental-sea-config', join(work, 'sea-config.json')], { stdio: 'inherit' });
await copyFile(process.execPath, executable);
execFileSync(process.execPath, [join(root, 'node_modules', 'postject', 'dist', 'cli.js'), executable,
  'NODE_SEA_BLOB', blob, '--sentinel-fuse', 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'], { stdio: 'inherit' });
await copyFile(join(root, 'windows-raw-print.ps1'), join(release, 'windows-raw-print.ps1'));
await copyFile(join(root, 'agent-config.example.json'), join(release, 'agent-config.example.json'));
await copyFile(join(root, 'deployment', 'install-task.ps1'), join(release, 'install-task.ps1'));
await copyFile(join(root, 'deployment', 'README.md'), join(release, 'README.md'));
await writeFile(join(release, 'VERSION.txt'), `${version}\nNode ${process.version}\nWindows x64\n`);
console.log(`Release ready: ${release}`);
