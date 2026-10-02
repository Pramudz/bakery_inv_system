const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');

const database = process.env.DB_DATABASE;
const confirmation = process.env.DB_BASELINE_CONFIRM;

function connectionOptions(extra = {}) {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    ...extra,
  };
}

async function main() {
  if (!database || !/^[A-Za-z0-9_]+$/.test(database)) throw new Error('DB_DATABASE must be a simple non-empty database name.');
  if (confirmation !== database) throw new Error('Set DB_BASELINE_CONFIRM to the exact DB_DATABASE value to authorize fresh-database creation.');
  if (String(process.env.DB_SYNCHRONIZE).toLowerCase() === 'true') throw new Error('DB_SYNCHRONIZE must remain false.');

  const server = await mysql.createConnection(connectionOptions());
  const [schemaRows] = await server.query('SELECT schema_name FROM information_schema.schemata WHERE schema_name = ?', [database]);
  const existed = schemaRows.length > 0;
  await server.query('CREATE DATABASE IF NOT EXISTS ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci', [database]);
  await server.end();

  const connection = await mysql.createConnection(connectionOptions({ database, multipleStatements: true }));
  const [tablesBefore] = await connection.query('SELECT table_name FROM information_schema.tables WHERE table_schema = ?', [database]);
  if (tablesBefore.length) {
    await connection.end();
    throw new Error(`Refusing to baseline non-empty database ${database}. Use the normal migration runner for an existing database.`);
  }

  const baselinePath = path.join(__dirname, '..', 'schema', 'baseline-1770000023000.sql');
  const baseline = fs.readFileSync(baselinePath, 'utf8');
  try {
    await connection.query(baseline);
    const [[summary]] = await connection.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = ?) AS tableCount,
        (SELECT COUNT(*) FROM migrations) AS migrationCount,
        (SELECT MAX(timestamp) FROM migrations) AS migrationCutoff`, [database]);
    if (Number(summary.migrationCount) !== 24 || Number(summary.migrationCutoff) !== 1770000023000) {
      throw new Error('Baseline verification failed: the migration ledger does not match cutoff 1770000023000.');
    }
    console.log(`Installed schema baseline 1770000023000 in ${database} (${summary.tableCount} tables).`);
  } catch (error) {
    if (!existed) console.error(`Baseline failed after creating ${database}; inspect and remove that incomplete fresh database before retrying.`);
    throw error;
  } finally {
    await connection.end();
  }

  const dataSource = require('../dist/data-source').default;
  await dataSource.initialize();
  try {
    const migrations = await dataSource.runMigrations({ transaction: 'each' });
    console.log(`Applied ${migrations.length} post-baseline migration(s).`);
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
