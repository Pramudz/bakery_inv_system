const assert = require('node:assert/strict');
const test = require('node:test');
const { manifest, checkDatabaseState, validateLedger } = require('./db-check.cjs');
const { validateCredentials } = require('./initialize-platform.cjs');

const release = manifest();
const env = { DB_TYPE: 'mysql', DB_HOST: 'localhost', DB_USERNAME: 'tester', DB_PASSWORD: 'test-only', DB_DATABASE: 'customer_db', INIT_DB_CONFIRM: 'customer_db' };

function database({ ledger = release.compiled, tables = ['migrations', 'tbl_platform_user', 'tbl_tenant', 'tbl_user'], counts = {}, version = '8.0.42', selectedDatabase = 'customer_db', tableCollation = 'utf8mb4_0900_ai_ci' } = {}) {
  const statements = [];
  let ended = false;
  const connection = {
    async query(sql) {
      statements.push(sql);
      assert.match(sql, /^(SELECT|SHOW)\b/i);
      if (sql.startsWith('SELECT VERSION')) return [[{ version, selectedDatabase, sqlMode: 'STRICT_TRANS_TABLES' }]];
      if (sql.includes('information_schema.schemata')) return [[{ charset: 'utf8mb4', collation: 'utf8mb4_0900_ai_ci' }]];
      if (sql.startsWith('SHOW COLLATION')) return [[{ Collation: 'utf8mb4_0900_ai_ci' }]];
      if (sql.includes('information_schema.tables')) return [tables.map(name => ({ name, collation: tableCollation }))];
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

test('an incompatible application table collation is diagnosed', async () => {
  const fake = database({ tableCollation: 'latin1_swedish_ci' });
  await assert.rejects(checkDatabaseState('inspect', { env, release, connect: fake.connect }), /incompatible collation/);
  assert.ok(fake.wasClosed());
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
