const assert = require('node:assert/strict');
const test = require('node:test');
const { manifest, checkDatabaseState, validateLedger } = require('./db-check.cjs');
const { validateCredentials } = require('./initialize-platform.cjs');
const { prepareFreshDatabase } = require('../backend/scripts/bootstrap-database.cjs');

const release = manifest();
const env = { DB_TYPE: 'mysql', DB_HOST: 'localhost', DB_USERNAME: 'tester', DB_PASSWORD: 'test-only', DB_DATABASE: 'customer_db', INIT_DB_CONFIRM: 'customer_db' };

function database({ ledger = release.compiled, tables = ['migrations', 'tbl_platform_user', 'tbl_tenant', 'tbl_user'], counts = {}, version = '8.0.42', selectedDatabase = 'customer_db', databaseCharset = 'utf8mb4', databaseCollation = 'utf8mb4_0900_ai_ci', tableCollation = 'utf8mb4_0900_ai_ci', tableCharset = 'utf8mb4', columns = [], collationAvailable = true, probeSupported = 1 } = {}) {
  const statements = [];
  let ended = false;
  const connection = {
    async query(sql) {
      statements.push(sql);
      assert.match(sql, /^(SELECT|SHOW)\b/i);
      if (sql.startsWith('SELECT VERSION')) return [[{ version, selectedDatabase, sqlMode: 'STRICT_TRANS_TABLES' }]];
      if (sql.includes('information_schema.schemata')) return [[{ charset: databaseCharset, collation: databaseCollation }]];
      if (sql.startsWith('SHOW COLLATION')) return [collationAvailable ? [{ Collation: 'utf8mb4_0900_ai_ci', Charset: 'utf8mb4' }] : []];
      if (sql.includes('AS supported')) return [[{ supported: probeSupported }]];
      if (sql.includes('information_schema.columns')) return [columns];
      if (sql.includes('information_schema.tables')) return [tables.map(name => ({ name, collation: typeof tableCollation === 'object' ? tableCollation[name] || 'utf8mb4_0900_ai_ci' : tableCollation, charset: typeof tableCharset === 'object' ? tableCharset[name] || 'utf8mb4' : tableCharset }))];
      if (sql.includes('FROM migrations')) return [ledger];
      const table = sql.match(/FROM (tbl_\w+)/)?.[1];
      if (table) return [[{ count: counts[table] || 0 }]];
      throw new Error(`Unmocked query: ${sql}`);
    },
    async end() { ended = true; },
  };
  return { connect: async () => connection, statements, wasClosed: () => ended };
}

test('invalid initialization target fails before connecting', async () => {
  const fake = database();
  await assert.rejects(checkDatabaseState('init-ready', { env: { ...env, INIT_DB_CONFIRM: 'another_db' }, release, connect: fake.connect }), /INIT_DB_CONFIRM/);
  assert.equal(fake.statements.length, 0);
});

test('wrong selected database and incompatible server stop read-only validation', async () => {
  const wrongTarget = database({ selectedDatabase: 'other_db' });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: wrongTarget.connect }), /Connected to other_db/);
  const oldServer = database({ version: '5.7.44' });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: oldServer.connect }), /MySQL 8.0/);
  assert.ok(wrongTarget.wasClosed() && oldServer.wasClosed());
});

test('wrong latin1 database default is rejected even when application tables are utf8mb4', async () => {
  const fake = database({ databaseCharset: 'latin1', databaseCollation: 'latin1_swedish_ci' });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: fake.connect }), /Database customer_db default must be CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; found latin1 \/ latin1_swedish_ci/);
  assert.ok(fake.wasClosed());
});

test('wrong utf8mb4 database default collation is rejected', async () => {
  const fake = database({ databaseCollation: 'utf8mb4_general_ci' });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: fake.connect }), /utf8mb4 \/ utf8mb4_general_ci/);
});

test('mixed application table collations are diagnosed with table names', async () => {
  const fake = database({ tableCollation: { tbl_user: 'latin1_swedish_ci' }, tableCharset: { tbl_user: 'latin1' } });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: fake.connect }), /tbl_user \(latin1 \/ latin1_swedish_ci\)/);
  assert.ok(fake.wasClosed());
});

test('a character column with a different collation is diagnosed', async () => {
  const fake = database({ columns: [{ tableName: 'tbl_user', columnName: 'name', charset: 'latin1', collation: 'latin1_swedish_ci' }] });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: fake.connect }), /tbl_user.name \(latin1 \/ latin1_swedish_ci\)/);
});

test('required collation must be available and work on the target server', async () => {
  const unavailable = database({ collationAvailable: false });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: unavailable.connect }), /unavailable/);
  const broken = database({ probeSupported: 0 });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: broken.connect }), /comparison did not behave/);
});

test('MariaDB 11.4.5 alias threshold is enforced', async () => {
  const oldServer = database({ version: '11.4.4-MariaDB' });
  await assert.rejects(checkDatabaseState('inspect', { env: { ...env, DB_TYPE: 'mariadb' }, release, connect: oldServer.connect }), /MariaDB 11.4.5/);
  const supported = database({ version: '11.4.13-MariaDB' });
  assert.equal((await checkDatabaseState('current', { env: { ...env, DB_TYPE: 'mariadb' }, release, connect: supported.connect })).state, 'current');
});

test('fresh bootstrap refuses a wrong existing default before any CREATE DATABASE', async () => {
  const statements = [];
  const server = { async query(sql) {
    statements.push(sql);
    if (sql.startsWith('SELECT VERSION')) return [[{ version: '11.4.13-MariaDB', selectedDatabase: null }]];
    if (sql.startsWith('SHOW COLLATION')) return [[{ Collation: 'utf8mb4_0900_ai_ci', Charset: 'utf8mb4' }]];
    if (sql.includes('information_schema.schemata')) return [[{ schema_name: 'customer_db', charset: 'latin1', collation: 'latin1_swedish_ci' }]];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  await assert.rejects(prepareFreshDatabase(server, 'customer_db', 'mariadb'), /required utf8mb4 \/ utf8mb4_0900_ai_ci/);
  assert.equal(statements.filter(sql => sql.startsWith('CREATE DATABASE')).length, 0);
});

test('fresh bootstrap creates only a missing database with explicit defaults', async () => {
  const statements = [];
  const server = { async query(sql, params) {
    statements.push({ sql, params });
    if (sql.startsWith('SELECT VERSION')) return [[{ version: '8.0.19', selectedDatabase: null }]];
    if (sql.startsWith('SHOW COLLATION')) return [[{ Collation: 'utf8mb4_0900_ai_ci', Charset: 'utf8mb4' }]];
    if (sql.includes('information_schema.schemata')) return [[]];
    if (sql.startsWith('CREATE DATABASE')) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected query: ${sql}`);
  } };
  assert.equal(await prepareFreshDatabase(server, 'customer_db', 'mysql'), false);
  assert.deepEqual(statements.at(-1), { sql: 'CREATE DATABASE ?? CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci', params: ['customer_db'] });
});

test('new empty database is distinct from an upgrade', async () => {
  const fake = database({ tables: [] });
  const state = await checkDatabaseState('inspect', { env, release, connect: fake.connect });
  assert.equal(state.state, 'empty');
  await assert.rejects(checkDatabaseState('current', { env, release, connect: fake.connect }), /empty/);
  assert.ok(fake.wasClosed());
});

test('existing installation reports pending migrations and cannot initialize yet', async () => {
  const fake = database({ ledger: release.compiled.slice(0, -2) });
  const result = await checkDatabaseState('inspect', { env, release, connect: fake.connect });
  assert.equal(result.state, 'upgrade');
  assert.equal(result.pending, 2);
  await assert.rejects(checkDatabaseState('init-ready', { env, release, connect: fake.connect }), /pending/);
});

test('missing, reordered and unexpectedly applied migrations are rejected', () => {
  assert.throws(() => validateLedger([release.compiled[1]], release.compiled), /diverges/);
  assert.throws(() => validateLedger([...release.compiled, { timestamp: 9999999999999, name: 'Unknown' }], release.compiled), /newer/);
  assert.throws(() => validateLedger([release.compiled[0], release.compiled[0]], release.compiled), /diverges/);
});

test('current existing installation passes read-only validation but refuses initialization', async () => {
  const fake = database({ counts: { tbl_platform_user: 1 } });
  assert.equal((await checkDatabaseState('current', { env, release, connect: fake.connect })).state, 'current');
  await assert.rejects(checkDatabaseState('init-ready', { env, release, connect: fake.connect }), /already contains data/);
  assert.ok(fake.wasClosed());
});

test('initial administrator requires the existing strong password policy', () => {
  assert.throws(() => validateCredentials({ INIT_PLATFORM_USERNAME: 'admin', INIT_PLATFORM_PASSWORD: 'weak' }), /strong/);
  assert.deepEqual(validateCredentials({ INIT_PLATFORM_USERNAME: ' admin ', INIT_PLATFORM_PASSWORD: 'StrongPassword9!' }), { username: 'admin', password: 'StrongPassword9!' });
});
