const fs = require('node:fs/promises');
const path = require('node:path');
const { makeWorkbook } = require('../dist/features/reference-imports/reference-import.excel');
const { IMPORT_SPECS } = require('../dist/features/reference-imports/reference-import.schema');

async function main() {
  const directory = path.resolve(__dirname, '../templates/reference-imports');
  await fs.mkdir(directory, { recursive: true });
  for (const [master, spec] of Object.entries(IMPORT_SPECS)) {
    for (const sample of [false, true]) {
      const filename = `${spec.filename}_${sample ? 'Sample' : 'Template'}.xlsx`;
      await fs.writeFile(path.join(directory, filename), await makeWorkbook(master, sample));
      process.stdout.write(`${filename}\n`);
    }
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
