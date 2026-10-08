const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.join(root, 'build', 'tifoam-package');
const backendDist = path.join(root, 'backend', 'dist');
const frontendDist = path.join(root, 'frontend', 'dist');
const baseline = path.join(root, 'backend', 'schema', 'baseline-1770000023000.sql');

for (const file of [
  path.join(backendDist, 'main.js'),
  path.join(frontendDist, 'index.html'),
  path.join(root, 'backend', 'package-lock.json'),
  baseline,
]) {
  if (!fs.existsSync(file)) throw new Error(`Build first: missing ${file}`);
}

if (path.dirname(target) !== path.join(root, 'build')) {
  throw new Error('Unexpected deployment package path');
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(target, { recursive: true });
fs.copyFileSync(path.join(root, 'server.js'), path.join(target, 'server.js'));
fs.mkdirSync(path.join(target, 'schema'), { recursive: true });
fs.mkdirSync(path.join(target, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(target, 'docs', 'deployment'), { recursive: true });
fs.copyFileSync(baseline, path.join(target, 'schema', 'baseline-1770000023000.sql'));
for (const script of ['tifoam-db-check.cjs', 'tifoam-initial-data.cjs']) {
  fs.copyFileSync(path.join(root, 'scripts', script), path.join(target, 'scripts', script));
}
for (const guide of ['tifoam-empty-test-database.md', 'tifoam-namecheap-test.md']) {
  fs.copyFileSync(path.join(root, 'docs', 'deployment', guide), path.join(target, 'docs', 'deployment', guide));
}
fs.cpSync(backendDist, path.join(target, 'backend', 'dist'), { recursive: true });
fs.cpSync(frontendDist, path.join(target, 'frontend', 'dist'), { recursive: true });
fs.copyFileSync(
  path.join(root, 'backend', 'package-lock.json'),
  path.join(target, 'package-lock.json'),
);

const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'backend', 'package.json'), 'utf8'),
);
manifest.scripts = { start: 'node server.js' };
manifest.engines = { node: '>=20 <25' };
fs.writeFileSync(
  path.join(target, 'package.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(`Deployment files staged in ${target}`);
