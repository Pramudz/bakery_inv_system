// Read-only checks for the dedicated, fresh Tifoam test database.
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const databaseName = 'prosnbvs_erp_tifoam';
const baselinePath = fs.existsSync(path.join(appRoot, 'schema', 'baseline-1770000023000.sql'))
  ? path.join(appRoot, 'schema', 'baseline-1770000023000.sql')
  : path.join(appRoot, 'backend', 'schema', 'baseline-1770000023000.sql');
const migrationsPath = path.join(appRoot, 'backend', 'dist', 'migrations');

function manifest() {
  const sql = fs.readFileSync(baselinePath, 'utf8');
  const tables = [...sql.matchAll(/^CREATE TABLE `([^`]+)`/gm)].map(match => match[1]);
  const baseline = [...sql.matchAll(/INSERT INTO migrations \(timestamp, name\) VALUES \((\d+), '([^']+)'\)/g)]
    .map(match => ({ timestamp: Number(match[1]), name: match[2] }));
  const compiled = fs.readdirSync(migrationsPath)
    .filter(name => /^\d{13}-.*\.js$/.test(name))
    .map(file => {
      const timestamp = Number(file.slice(0, 13));
      const code = fs.readFileSync(path.join(migrationsPath, file), 'utf8');
      const className = code.match(/\bclass ([A-Za-z][A-Za-z0-9_]+)\s*\{/g)
        ?.map(match => match.match(/\bclass ([A-Za-z][A-Za-z0-9_]+)/)[1])
        .find(name => name.endsWith(String(timestamp)));
      if (!className || !code.includes(`exports.${className} = ${className}`)) {
        throw new Error(`Migration class missing in ${file}`);
      }
      const declaredName = code.match(/\bname = ['"]([^'"]+)['"]/);
      return { timestamp, name: declaredName ? declaredName[1] : className };
    }).sort((a, b) => a.timestamp - b.timestamp);
  if (tables.length !== 57 || baseline.length !== 24 || compiled.length !== 44 ||
      compiled.at(-1).timestamp !== 1770000043000 ||
      baseline.some((row, index) => row.timestamp !== compiled[index].timestamp || row.name !== compiled[index].name) ||
      new Set(compiled.map(row => row.timestamp)).size !== compiled.length) {
    throw new Error('Baseline and compiled migration manifest do not match the audited release');
  }
  return { tables, baseline, compiled };
}

async function checkDatabaseState(state) {
  if (!['empty', 'baseline', 'migrated', 'platform-ready', 'tenant-created'].includes(state)) {
    throw new Error('State must be empty, baseline, migrated, platform-ready, or tenant-created');
  }
  if (process.env.DB_DATABASE !== databaseName || process.env.INIT_DB_CONFIRM !== databaseName) {
    throw new Error(`DB_DATABASE and INIT_DB_CONFIRM must both equal ${databaseName}`);
  }
  if (process.env.DB_TYPE !== 'mariadb') throw new Error('DB_TYPE must be mariadb');
  if (!process.env.DB_HOST || !process.env.DB_USERNAME || !process.env.DB_PASSWORD) {
    throw new Error('DB_HOST, DB_USERNAME, and DB_PASSWORD are required');
  }
  if (process.env.DB_SYNCHRONIZE === 'true') throw new Error('DB_SYNCHRONIZE must not be true');

  const mysql = require('mysql2/promise');
  const expected = manifest();
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: databaseName,
  });
  try {
    const [[server]] = await connection.query('SELECT VERSION() AS version, DATABASE() AS selectedDatabase, @@sql_mode AS sqlMode');
    if (server.selectedDatabase !== databaseName || !/^11\.4\.13-MariaDB/i.test(server.version)) {
      throw new Error(`Expected ${databaseName} on MariaDB 11.4.13; got ${server.selectedDatabase} on ${server.version}`);
    }
    const [collations] = await connection.query("SHOW COLLATION LIKE 'utf8mb4_0900_ai_ci'");
    if (collations.length !== 1) throw new Error('Required collation is unavailable');
    const [tableRows] = await connection.query(
      'SELECT TABLE_NAME AS name FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
      [databaseName, 'BASE TABLE'],
    );
    const tables = new Set(tableRows.map(row => row.name));
    if (state === 'empty') {
      if (tables.size !== 0) throw new Error(`Expected an empty database; found ${tables.size} tables`);
    } else {
      for (const name of expected.tables) if (!tables.has(name)) throw new Error(`Baseline table missing: ${name}`);
      if (state === 'baseline' && tables.size !== 57) throw new Error(`Expected 57 baseline tables; found ${tables.size}`);
      const [ledger] = await connection.query('SELECT timestamp, name FROM migrations ORDER BY timestamp, name');
      const target = state === 'baseline' ? expected.baseline : expected.compiled;
      if (ledger.length !== target.length || ledger.some((row, index) =>
        Number(row.timestamp) !== target[index].timestamp || row.name !== target[index].name)) {
        throw new Error(`Migration ledger does not match the expected ${target.length} entries`);
      }
      if (['migrated', 'platform-ready', 'tenant-created'].includes(state)) {
        for (const name of ['tbl_pos_cash_register', 'tbl_quotation', 'tbl_stock_transfer']) {
          if (!tables.has(name)) throw new Error(`Post-baseline table missing: ${name}`);
        }
      }
      if (state === 'platform-ready' || state === 'tenant-created') {
        const [[counts]] = await connection.query(`SELECT
          (SELECT COUNT(*) FROM tbl_platform_user) AS platformUsers,
          (SELECT COUNT(*) FROM tbl_module) AS modules,
          (SELECT COUNT(*) FROM tbl_permission) AS permissions,
          (SELECT COUNT(*) FROM tbl_tenant) AS tenants,
          (SELECT COUNT(*) FROM tbl_tenant WHERE code = 'TIFOAM') AS tifoamTenants,
          (SELECT COUNT(*) FROM tbl_user u JOIN tbl_tenant t ON t.tenant_id = u.tenant_id
            WHERE t.code = 'TIFOAM' AND u.username = 'Admin') AS tenantAdmins,
          (SELECT COUNT(*) FROM tbl_role r JOIN tbl_tenant t ON t.tenant_id = r.tenant_id
            WHERE t.code = 'TIFOAM' AND r.code = 'TENANT_ADMIN') AS tenantAdminRoles,
          (SELECT COUNT(*) FROM tbl_user_role ur JOIN tbl_user u ON u.user_id = ur.user_id
            JOIN tbl_tenant t ON t.tenant_id = u.tenant_id WHERE t.code = 'TIFOAM') AS userRoles,
          (SELECT COUNT(*) FROM tbl_tenant_module tm JOIN tbl_tenant t ON t.tenant_id = tm.tenant_id
            WHERE t.code = 'TIFOAM') AS tenantModules,
          (SELECT COUNT(*) FROM tbl_inventory_adjustment_reason r JOIN tbl_tenant t ON t.tenant_id = r.tenant_id
            WHERE t.code = 'TIFOAM' AND r.is_system_reason = 1) AS systemReasons`);
        if (Number(counts.platformUsers) !== 1 || Number(counts.modules) !== 10 || !Number(counts.permissions)) {
          throw new Error('Platform administrator or authorization catalog is incomplete');
        }
        const required = ['USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'USER_DEACTIVATE',
          'ROLE_VIEW', 'ROLE_CREATE', 'ROLE_UPDATE', 'ROLE_DEACTIVATE',
          'PERMISSION_VIEW', 'ROLE_PERMISSION_VIEW', 'ROLE_PERMISSION_UPDATE'];
        const [found] = await connection.query('SELECT code FROM tbl_permission WHERE code IN (?) AND is_active = 1', [required]);
        if (found.length !== required.length) throw new Error('User and role management permissions are incomplete');
        if (state === 'platform-ready' && Number(counts.tenants) !== 0) {
          throw new Error('Platform-ready check expects zero tenants; use tenant-created after UI creation');
        }
        if (state === 'tenant-created' && (Number(counts.tifoamTenants) !== 1 ||
            Number(counts.tenantAdmins) !== 1 || Number(counts.tenantAdminRoles) !== 1 ||
            Number(counts.userRoles) !== 1 || Number(counts.tenantModules) !== 9 ||
            Number(counts.systemReasons) !== 9)) {
          throw new Error('TIFOAM tenant or its transactional bootstrap rows are incomplete');
        }
      }
    }
    console.log(`${state} check passed: ${tables.size} tables on ${server.version}; SQL mode: ${server.sqlMode}`);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  const state = process.argv[2];
  if (state === 'manifest') {
    const current = manifest();
    console.log(`Manifest passed: ${current.tables.length} baseline tables, ${current.baseline.length} baseline migrations, ${current.compiled.length} total migrations`);
  } else {
    checkDatabaseState(state).catch(error => { console.error(error.message); process.exitCode = 1; });
  }
}

module.exports = { manifest, checkDatabaseState };
