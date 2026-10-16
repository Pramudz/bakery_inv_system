// One-time offline initialization; never invoke during an ordinary upgrade.
const { checkDatabaseState } = require('./db-check.cjs');

function validateCredentials(env) {
  const username = (env.INIT_PLATFORM_USERNAME || '').trim();
  const password = env.INIT_PLATFORM_PASSWORD || '';
  if (!username || username.length > 100 || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('Set INIT_PLATFORM_USERNAME (1-100 chars) and a strong INIT_PLATFORM_PASSWORD (12-72 UTF-8 bytes, upper/lowercase, number, symbol)');
  }
  return { username, password };
}

async function ensureNoPlatformAdministrator(dataSource) {
  const [existing] = await dataSource.query('SELECT COUNT(*) AS count FROM tbl_platform_user');
  if (Number(existing?.count) !== 0) throw new Error('Platform administrator already exists; no credentials were changed');
}

async function main() {
  const credentials = validateCredentials(process.env);
  await checkDatabaseState('init-ready'); // Confirms target, complete migrations, and zero platform/tenant users.
  require('reflect-metadata');
  const { NestFactory } = require('@nestjs/core');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../backend/dist/app.module.js');
  const { AuthService } = require('../backend/dist/features/auth/auth.service.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const dataSource = app.get(DataSource);
    // The Nest context seeds the global authorization catalog on module initialization.
    await ensureNoPlatformAdministrator(dataSource);
    const platform = await app.get(AuthService).bootstrap(credentials);
    console.log(`Created Platform Administrator ${platform.platformUser.platformUserId}; create tenants through Platform Administration`);
  } finally {
    await app.close();
  }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { validateCredentials, ensureNoPlatformAdministrator, main };
