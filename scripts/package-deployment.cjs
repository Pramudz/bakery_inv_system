// Build once per release; stage only files needed by the cPanel application.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const buildRoot = path.join(root, 'build');
const target = path.join(buildRoot, 'deployment-package');
const allowDirty = process.argv.includes('--allow-dirty');
const validateOnly = process.argv.includes('--validate-only');
if (process.argv.slice(2).some(arg => !['--allow-dirty', '--validate-only'].includes(arg))) throw new Error('Usage: node scripts/package-deployment.cjs [--allow-dirty] [--validate-only]');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
  if (result.error || result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stderr || result.error || result.stdout}`);
  return result.stdout.trim();
}

function required(file) {
  if (!fs.statSync(file, { throwIfNoEntry: true })?.isFile()) throw new Error(`Missing required release file: ${file}`);
}

function copyFile(source, relative, stage) {
  required(source);
  const parts = relative.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Unsafe release path: ${relative}`);
  const destination = path.join(stage, ...parts);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyTree(source, prefix, stage, keep) {
  if (!fs.statSync(source, { throwIfNoEntry: true })?.isDirectory()) throw new Error(`Missing build directory: ${source}`);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const absolute = path.join(source, entry.name);
    if (entry.isDirectory() && /^(?:node_modules|uploads|logs?|\.env.*)$/i.test(entry.name)) throw new Error(`Forbidden build directory: ${absolute}`);
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not permitted in a deployment: ${absolute}`);
    if (entry.isDirectory()) copyTree(absolute, `${prefix}/${entry.name}`, stage, keep);
    else if (entry.isFile() && keep(absolute, entry.name)) copyFile(absolute, `${prefix}/${entry.name}`, stage);
    else if (!entry.isFile()) throw new Error(`Unsupported build artifact: ${absolute}`);
  }
}

function filesUnder(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    const name = [relative, entry.name].filter(Boolean).join('/');
    return entry.isDirectory() ? filesUnder(directory, name) : [name];
  });
}

function main() {
  // Check source DDL before a build can become a release package.
  require('./migration-collation-guard.cjs').checkRelease();
  const commit = run('git', ['rev-parse', '--verify', 'HEAD']);
  const changes = run('git', ['status', '--porcelain', '--untracked-files=all', '--', 'backend', 'frontend', 'server.js', 'scripts', 'docs/deployment']);
  if (changes && !allowDirty) throw new Error('Release inputs contain uncommitted changes. Commit and rebuild for a production archive; --allow-dirty is for local validation only.');
  const backend = JSON.parse(fs.readFileSync(path.join(root, 'backend/package.json'), 'utf8'));
  const frontend = JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'), 'utf8'));
  if (backend.version !== frontend.version || !/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(backend.version)) {
    throw new Error('Backend and frontend package versions must match and be valid semver');
  }

  // Always rebuild: timestamps alone cannot prove which source produced a dist tree.
  for (const project of ['backend', 'frontend']) {
    process.stdout.write(`Building ${project}...\n`);
    if (process.platform === 'win32') run('cmd.exe', ['/d', '/s', '/c', 'npm run build'], path.join(root, project));
    else run('npm', ['run', 'build'], path.join(root, project));
  }
  for (const file of ['server.js', 'backend/dist/main.js', 'backend/dist/app.module.js', 'backend/dist/data-source.js', 'backend/dist/static-app.js', 'backend/package-lock.json', 'frontend/dist/index.html']) {
    required(path.join(root, file));
  }
  const { manifest } = require('./db-check.cjs');
  const migrations = manifest();
  if (!migrations.compiled.length) throw new Error('Compiled migration set is empty');

  fs.mkdirSync(buildRoot, { recursive: true });
  const stage = fs.mkdtempSync(path.join(buildRoot, '.deployment-stage-'));
  try {
    copyFile(path.join(root, 'server.js'), 'server.js', stage);
    copyTree(path.join(root, 'backend/dist'), 'backend/dist', stage,
      (_file, name) => name.endsWith('.js') && !name.endsWith('.spec.js') && !name.endsWith('.mysql.js'));
    copyTree(path.join(root, 'frontend/dist'), 'frontend/dist', stage,
      (_file, name) => /\.(?:html|js|css|svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/.test(name));
    copyFile(path.join(root, 'backend/package-lock.json'), 'package-lock.json', stage);
    const baseline = path.join(root, 'backend/schema', migrations.baselineFile);
    copyFile(baseline, `schema/${migrations.baselineFile}`, stage);
    for (const script of ['db-check.cjs', 'initialize-platform.cjs']) copyFile(path.join(__dirname, script), `scripts/${script}`, stage);
    copyFile(path.join(root, 'docs/deployment/prosinc-erp-namecheap.md'), 'docs/deployment/prosinc-erp-namecheap.md', stage);
    const runtimeManifest = { ...backend, scripts: { start: 'node server.js' }, engines: { node: '>=20 <25' } };
    fs.writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify(runtimeManifest, null, 2)}\n`);
    // The lockfile must describe the dependency set that npm ci will install.
    const lock = JSON.parse(fs.readFileSync(path.join(stage, 'package-lock.json'), 'utf8'));
    if (lock.packages?.['']?.name !== backend.name || lock.packages?.['']?.version !== backend.version ||
        JSON.stringify(lock.packages[''].dependencies) !== JSON.stringify(backend.dependencies)) {
      throw new Error('Backend package-lock.json is out of sync with package.json');
    }
    const files = Object.fromEntries(filesUnder(stage).sort().map(name => [name,
      crypto.createHash('sha256').update(fs.readFileSync(path.join(stage, name))).digest('hex')]));
    const release = { application: 'prosinc-erp', version: backend.version, commit, dirty: Boolean(changes), builtAt: new Date().toISOString(), migrations: migrations.compiled.at(-1), files };
    fs.writeFileSync(path.join(stage, 'release.json'), `${JSON.stringify(release, null, 2)}\n`);
    if (validateOnly) {
      console.log(`Validated ${Object.keys(files).length} release files without replacing ${target} (${commit.slice(0, 12)}${changes ? ', dirty' : ''})`);
    } else {
      if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
      fs.renameSync(stage, target);
      console.log(`Staged ${Object.keys(files).length} files in ${target} (${commit.slice(0, 12)}${changes ? ', dirty' : ''})`);
    }
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
