// Run with the HTTP app stopped, after all migrations have passed. Safe to rerun.
require('reflect-metadata');
const { checkDatabaseState } = require('./tifoam-db-check.cjs');

async function main() {
  const username = (process.env.INIT_PLATFORM_USERNAME || '').trim();
  const platformPassword = process.env.INIT_PLATFORM_PASSWORD || '';
  if (!username || username.length > 100 || platformPassword.length < 12 ||
      Buffer.byteLength(platformPassword, 'utf8') > 72 || !/[a-z]/.test(platformPassword) ||
      !/[A-Z]/.test(platformPassword) || !/[0-9]/.test(platformPassword) ||
      !/[^A-Za-z0-9]/.test(platformPassword)) {
    throw new Error('Set INIT_PLATFORM_USERNAME (1-100 chars) and a strong INIT_PLATFORM_PASSWORD (12-72 UTF-8 bytes, upper/lowercase, number, symbol)');
  }
  await checkDatabaseState('migrated');

  const { NestFactory } = require('@nestjs/core');
  const { DataSource } = require('typeorm');
  const { AppModule } = require('../backend/dist/app.module.js');
  const { AuthService } = require('../backend/dist/features/auth/auth.service.js');
  const bcrypt = require('bcrypt');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const dataSource = app.get(DataSource);
    const users = await dataSource.query('SELECT platform_user_id AS id, username, password_hash AS hash FROM tbl_platform_user');
    if (users.length > 1) throw new Error('Multiple platform administrators exist; review manually');
    if (users.length === 1) {
      if (users[0].username !== username || !await bcrypt.compare(platformPassword, users[0].hash)) {
        throw new Error('Existing platform administrator differs from supplied credentials; no changes made');
      }
      console.log(`Platform administrator ${users[0].id} already exists; no duplicate created`);
    } else {
      const platform = await app.get(AuthService).bootstrap({ username, password: platformPassword });
      console.log(`Platform administrator ${platform.platformUser.platformUserId} created`);
    }
    console.log('Global authorization catalog initialized; create TIFOAM through Platform Administration after starting the app');
  } finally {
    await app.close();
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
