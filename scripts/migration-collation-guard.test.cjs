const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { inspectMigration, inspectBaseline, checkRelease } = require('./migration-collation-guard.cjs');

const charset = 'DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci';

test('raw SQL CREATE TABLE must specify the exact table charset and collation', () => {
  assert.equal(inspectMigration('await runner.query(`CREATE TABLE example (id INT) ENGINE=InnoDB`);').errors.length, 1);
  assert.equal(inspectMigration('await runner.query(`CREATE TABLE example (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`);').errors.length, 1);
  assert.equal(inspectMigration(`await runner.query(\`CREATE TABLE example (id INT) ENGINE=InnoDB ${charset}\`);`).errors.length, 0);
  assert.ok(inspectMigration('await runner.query(`CREATE TABLE ${name} (id INT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`);').errors.length > 0);
  assert.ok(inspectMigration("await runner.query('CREATE ' + 'TABLE example (id INT)');").errors.length > 0);
  assert.ok(inspectMigration('const sql = `CREATE TABLE example (id INT)`; await runner.query(sql);').errors.length > 0);
});

test('TypeORM Table creation must specify the exact engine options', () => {
  assert.equal(inspectMigration('await runner.createTable(new Table({ name: "example", columns: [] }));').errors.length, 1);
  assert.equal(inspectMigration(`await runner.createTable(new Table({ engine: 'InnoDB ${charset}', name: 'example', columns: [] }));`).errors.length, 0);
  assert.equal(inspectMigration('await runner.createTable(table);').errors.length, 1);
});

test('installed TypeORM MySQL query runner emits the required clauses', () => {
  const { Table } = require('../backend/node_modules/typeorm');
  const { MysqlQueryRunner } = require('../backend/node_modules/typeorm/driver/mysql/MysqlQueryRunner');
  const table = new Table({ name: 'example', engine: `InnoDB ${charset}`, columns: [{ name: 'id', type: 'int', isPrimary: true }] });
  const query = MysqlQueryRunner.prototype.createTableSql.call({
    escapePath: value => `\`${value.name}\``,
    buildCreateColumnSql: column => `\`${column.name}\` int`,
  }, table, false);
  assert.match(query.query, /ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci$/);
});

test('baseline and complete fresh-install migration source path use explicit clauses', () => {
  assert.equal(inspectBaseline('CREATE TABLE example (id INT) ENGINE=InnoDB;').errors.length, 1);
  const result = checkRelease();
  const baseline = fs.readFileSync(path.resolve(__dirname, '../backend/schema/baseline-1770000023000.sql'), 'utf8');
  assert.equal(result.migrations, 51);
  assert.equal(result.baselineTables, 57);
  assert.equal(result.rawTables + result.typeormTables, 40);
  assert.equal([...baseline.matchAll(/INSERT INTO migrations\s*\(timestamp, name\)\s*VALUES/gi)].length, 24);
});
