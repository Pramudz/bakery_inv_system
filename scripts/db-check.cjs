// Read-only release and target database validation. No schema or data writes.
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const migrationDir = path.join(appRoot, 'backend/dist/migrations');
const schemaDir = fs.existsSync(path.join(appRoot, 'schema')) ? path.join(appRoot, 'schema') : path.join(appRoot, 'backend/schema');
const requiredCharset = 'utf8mb4';
const requiredCollation = 'utf8mb4_0900_ai_ci';

function manifest() {
  const baselineFiles = fs.readdirSync(schemaDir).filter(name => /^baseline-\d+\.sql$/.test(name));
  if (baselineFiles.length !== 1) throw new Error('Release must contain exactly one baseline SQL file');
  const sql = fs.readFileSync(path.join(schemaDir, baselineFiles[0]), 'utf8');
  const baseline = [...sql.matchAll(/INSERT INTO migrations\s*\(timestamp, name\)\s*VALUES\s*\((\d+),\s*'([^']+)'\)/gi)]
    .map(([, timestamp, name]) => ({ timestamp: Number(timestamp), name }));
  const baselineTables = [...sql.matchAll(/^CREATE TABLE `([^`]+)`/gm)].map(([, name]) => name);
  const collations = [...new Set([...sql.matchAll(/\bCOLLATE(?:\s*=\s*|\s+)([A-Za-z0-9_]+)/gi)].map(([, name]) => name))];
  const compiled = fs.readdirSync(migrationDir).filter(name => /^\d{13}-.+\.js$/.test(name))
    .map(file => {
      const timestamp = Number(file.slice(0, 13));
      const exports = require(path.join(migrationDir, file));
      const migration = Object.values(exports).find(value => typeof value === 'function' &&
        value.name.endsWith(String(timestamp)) && typeof value.prototype?.up === 'function' && typeof value.prototype?.down === 'function');
      if (!migration) throw new Error(`No valid TypeORM migration class in ${file}`);
      const instance = new migration();
      return { timestamp, name: instance.name || migration.name };
    }).sort((a, b) => a.timestamp - b.timestamp);
  if (!baseline.length || !compiled.length || !baselineTables.includes('migrations') || !collations.length) {
    throw new Error('Baseline or compiled migration manifest is incomplete');
  }
  if (new Set(baselineTables).size !== baselineTables.length || new Set(compiled.map(row => row.timestamp)).size !== compiled.length ||
      new Set(compiled.map(row => row.name)).size !== compiled.length ||
      baseline.length > compiled.length || baseline.some((row, index) => row.timestamp !== compiled[index].timestamp || row.name !== compiled[index].name)) {
    throw new Error('Baseline history and compiled migrations are incompatible');
  }
  return { baselineFile: baselineFiles[0], baselineTables, baseline, compiled, collations };
}

function configuration(env, mode) {
  const database = (env.DB_DATABASE || '').trim();
  if (!database || !env.DB_HOST || !env.DB_USERNAME || !env.DB_PASSWORD) {
    throw new Error('DB_DATABASE, DB_HOST, DB_USERNAME and DB_PASSWORD are required');
  }
  if (!['mysql', 'mariadb'].includes(env.DB_TYPE || 'mysql')) throw new Error('DB_TYPE must be mysql or mariadb');
  const port = Number(env.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DB_PORT must be a valid TCP port');
  if (env.DB_SYNCHRONIZE === 'true') throw new Error('DB_SYNCHRONIZE must not be true');
  if (mode === 'init-ready' && env.INIT_DB_CONFIRM !== database) {
    throw new Error('INIT_DB_CONFIRM must exactly match DB_DATABASE for initialization');
  }
  return { database, type: env.DB_TYPE || 'mysql', host: env.DB_HOST, user: env.DB_USERNAME, password: env.DB_PASSWORD, port };
}

function validateVersion(version, type) {
  const maria = /mariadb/i.test(version);
  if (maria !== (type === 'mariadb')) throw new Error(`DB_TYPE=${type} does not match server ${version}`);
  const parts = version.match(/^(\d+)\.(\d+)/);
  if (!parts) throw new Error(`Unrecognized database server version: ${version}`);
  const major = Number(parts[1]);
  const minor = Number(parts[2]);
  const patch = Number(version.match(/^\d+\.\d+\.(\d+)/)?.[1] || 0);
  if (maria ? (major < 11 || (major === 11 && (minor < 4 || (minor === 4 && patch < 5)))) : major < 8) {
    throw new Error(`${version} is below the release's supported ${maria ? 'MariaDB 11.4.5' : 'MySQL 8.0'} minimum`);
  }
}

function validateLedger(actual, expected) {
  if (actual.length > expected.length) throw new Error('Database has migrations newer than this release');
  for (let index = 0; index < actual.length; index++) {
    const row = actual[index];
    const want = expected[index];
    if (Number(row.timestamp) !== want.timestamp || row.name !== want.name) {
      throw new Error(`Migration history diverges at entry ${index + 1}: found ${row.name} (${row.timestamp}); expected ${want.name} (${want.timestamp}). Missing, changed, out-of-order or unexpected migrations require review.`);
    }
  }
  return expected.length - actual.length;
}

function hasJsonValidationCheck(column, checks) {
  const name = column.columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clause = new RegExp(`^\\s*\\(*\\s*json_valid\\s*\\(\\s*(?:\`${name}\`|"${name}"|${name})\\s*\\)\\s*\\)*\\s*$`, 'i');
  return checks.some(check => check.tableName === column.tableName && clause.test(String(check.checkClause || '')));
}

async function checkDatabaseState(mode = 'inspect', options = {}) {
  if (!['inspect', 'empty', 'current', 'init-ready'].includes(mode)) throw new Error('Mode must be inspect, empty, current or init-ready');
  const env = options.env || process.env;
  const config = configuration(env, mode);
  const release = options.release || manifest();
  const connect = options.connect || (settings => require('mysql2/promise').createConnection(settings));
  const connection = await connect({ host: config.host, port: config.port, user: config.user, password: config.password, database: config.database });
  try {
    const [[server]] = await connection.query('SELECT VERSION() AS version, DATABASE() AS selectedDatabase, @@sql_mode AS sqlMode');
    if (server.selectedDatabase !== config.database) throw new Error(`Connected to ${server.selectedDatabase}; expected ${config.database}`);
    validateVersion(server.version, config.type);
    const [[schema]] = await connection.query('SELECT DEFAULT_CHARACTER_SET_NAME AS charset, DEFAULT_COLLATION_NAME AS collation FROM information_schema.schemata WHERE SCHEMA_NAME = ?', [config.database]);
    if (!schema || schema.charset !== requiredCharset || schema.collation !== requiredCollation) {
      throw new Error(`Database ${config.database} default must be CHARACTER SET ${requiredCharset} COLLATE ${requiredCollation}; found ${schema?.charset || 'unknown'} / ${schema?.collation || 'unknown'}. Correct the database default before a fresh baseline import or further migrations; review existing tables separately.`);
    }
    for (const collation of release.collations) {
      const [rows] = await connection.query('SHOW COLLATION LIKE ?', [collation]);
      if (!rows.some(row => row.Collation === collation && row.Charset === requiredCharset)) {
        throw new Error(`Required collation ${collation} for ${requiredCharset} is unavailable on ${server.version}`);
      }
    }
    // A real expression also catches a server that lists an alias but cannot use it.
    const [[probe]] = await connection.query("SELECT _utf8mb4'a' COLLATE utf8mb4_0900_ai_ci = _utf8mb4'A' COLLATE utf8mb4_0900_ai_ci AS supported");
    if (Number(probe?.supported) !== 1) throw new Error(`${requiredCollation} comparison did not behave as a case-insensitive collation on ${server.version}`);
    const [tableRows] = await connection.query('SELECT t.TABLE_NAME AS name, t.TABLE_COLLATION AS collation, c.CHARACTER_SET_NAME AS charset FROM information_schema.tables t LEFT JOIN information_schema.collations c ON c.COLLATION_NAME = t.TABLE_COLLATION WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE = ?', [config.database, 'BASE TABLE']);
    const tables = new Set(tableRows.map(row => row.name));
    if (tables.size === 0) {
      if (mode !== 'inspect' && mode !== 'empty') throw new Error('Database is empty; import the release baseline and apply migrations before initialization or startup');
      return { state: 'empty', pending: release.compiled.length, database: config.database, version: server.version };
    }
    if (mode === 'empty') throw new Error(`Database is not empty (${tables.size} tables); refusing fresh-install path`);
    const incompatibleTables = tableRows.filter(row => row.charset !== requiredCharset || row.collation !== requiredCollation);
    if (incompatibleTables.length) {
      const examples = incompatibleTables.slice(0, 8).map(row => `${row.name} (${row.charset || 'unknown'} / ${row.collation || 'unknown'})`).join(', ');
      throw new Error(`${incompatibleTables.length} database table(s) require ${requiredCharset} / ${requiredCollation}; found ${examples}${incompatibleTables.length > 8 ? ', ...' : ''}. Read-only validation cannot convert existing customer tables.`);
    }
    const [columnRows] = await connection.query("SELECT c.TABLE_NAME AS tableName, c.COLUMN_NAME AS columnName, c.DATA_TYPE AS dataType, c.CHARACTER_SET_NAME AS charset, c.COLLATION_NAME AS collation FROM information_schema.columns c JOIN information_schema.tables t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME AND t.TABLE_TYPE = 'BASE TABLE' WHERE c.TABLE_SCHEMA = ? AND c.COLLATION_NAME IS NOT NULL", [config.database]);
    const mariaJsonCandidates = config.type === 'mariadb' ? columnRows.filter(row =>
      row.charset === requiredCharset && row.collation === 'utf8mb4_bin' && String(row.dataType).toLowerCase() === 'longtext') : [];
    const [jsonChecks] = mariaJsonCandidates.length ? await connection.query('SELECT TABLE_NAME AS tableName, CHECK_CLAUSE AS checkClause FROM information_schema.check_constraints WHERE CONSTRAINT_SCHEMA = ?', [config.database]) : [[]];
    const incompatibleColumns = columnRows.filter(row => {
      if (row.charset === requiredCharset && row.collation === requiredCollation) return false;
      if (row.charset !== requiredCharset || row.collation !== 'utf8mb4_bin') return true;
      if (config.type === 'mysql' && String(row.dataType).toLowerCase() === 'json') return false;
      return !(config.type === 'mariadb' && String(row.dataType).toLowerCase() === 'longtext' && hasJsonValidationCheck(row, jsonChecks));
    });
    if (incompatibleColumns.length) {
      const examples = incompatibleColumns.slice(0, 8).map(row => `${row.tableName}.${row.columnName} (${row.charset || 'unknown'} / ${row.collation || 'unknown'})`).join(', ');
      throw new Error(`${incompatibleColumns.length} character column(s) require ${requiredCharset} / ${requiredCollation}; found ${examples}${incompatibleColumns.length > 8 ? ', ...' : ''}. Review column definitions before any conversion.`);
    }
    if (!tables.has('migrations')) throw new Error('Existing database has tables but no migrations ledger; manual review is required');
    const [ledger] = await connection.query('SELECT timestamp, name FROM migrations ORDER BY timestamp, name');
    if (!ledger.length) throw new Error('Existing database has an empty migrations ledger; manual review is required');
    const pending = validateLedger(ledger, release.compiled);
    if (ledger.length === release.baseline.length) {
      for (const table of release.baselineTables) if (!tables.has(table)) throw new Error(`Baseline table missing: ${table}`);
    }
    if (mode !== 'inspect' && pending) throw new Error(`${pending} release migration(s) are pending; apply reviewed migrations before continuing`);
    if (mode === 'init-ready') {
      for (const table of ['tbl_platform_user', 'tbl_tenant', 'tbl_user']) {
        if (!tables.has(table)) throw new Error(`Required application table missing: ${table}`);
        const [[row]] = await connection.query(`SELECT COUNT(*) AS count FROM ${table}`);
        if (Number(row.count) !== 0) throw new Error(`${table} already contains data; platform initialization is only for a fresh instance`);
      }
    }
    return { state: pending ? 'upgrade' : 'current', pending, applied: ledger.length, database: config.database, version: server.version, sqlMode: server.sqlMode, collation: schema.collation };
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  const mode = process.argv[2] || 'inspect';
  if (mode === 'manifest') {
    try {
      const release = manifest();
      console.log(`Release manifest: ${release.baselineTables.length} baseline tables; ${release.baseline.length} baseline migrations; ${release.compiled.length} compiled migrations; latest ${release.compiled.at(-1).name}`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  } else {
    checkDatabaseState(mode).then(result => console.log(`${result.database}: ${result.state}; ${result.pending} pending migration(s); ${result.version}${result.sqlMode ? `; SQL mode ${result.sqlMode}` : ''}`))
      .catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = { manifest, configuration, validateVersion, validateLedger, checkDatabaseState };
