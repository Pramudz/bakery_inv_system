import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { databaseType } from '../../database-type';
import { staticAppOptions } from '../../static-app';

@Controller('ping')
class PingController {
  @Get()
  ping() {
    return { ok: true };
  }
}

test('database type accepts only the configured MySQL family driver', () => {
  assert.equal(databaseType(undefined), 'mysql');
  assert.equal(databaseType('mariadb'), 'mariadb');
  assert.throws(() => databaseType('postgres'), /DB_TYPE/);
});

test('static frontend serves SPA paths without swallowing API or missing assets', async () => {
  const rootPath = mkdtempSync(join(tmpdir(), 'erp-static-'));
  mkdirSync(join(rootPath, 'assets'));
  writeFileSync(join(rootPath, 'index.html'), '<html>ERP shell</html>');
  writeFileSync(join(rootPath, 'assets', 'app.js'), 'window.erp = true;');

  @Module({
    imports: [ServeStaticModule.forRoot({ ...staticAppOptions, rootPath })],
    controllers: [PingController],
  })
  class TestModule {}

  const app = await NestFactory.create(TestModule, { logger: false });
  try {
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}`;

    const api = await fetch(`${base}/api/ping`);
    assert.deepEqual(await api.json(), { ok: true });
    const apiMissing = await fetch(`${base}/api/missing`);
    assert.equal(apiMissing.status, 404);
    assert.match(apiMissing.headers.get('content-type') || '', /json/);

    for (const path of ['/', '/dashboard/settings']) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /ERP shell/);
    }
    const asset = await fetch(`${base}/assets/app.js`);
    assert.match(await asset.text(), /window\.erp/);
    const missingAsset = await fetch(`${base}/assets/missing.js`);
    assert.equal(missingAsset.status, 404);
  } finally {
    await app.close();
    rmSync(rootPath, { recursive: true, force: true });
  }
});
