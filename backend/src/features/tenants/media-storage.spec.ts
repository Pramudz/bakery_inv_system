import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { MediaStorageService } from '../../common/media-storage.service';

test('tenant logo is stored as a URL and can be removed', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tenant-logo-test-'));
  try {
    const service = new MediaStorageService();
    (service as any).tenantLogoDirectory = directory;
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const url = await service.replaceTenantLogo(null, { buffer: png, originalname: 'logo.png' });
    assert.match(url, /^\/api\/media\/tenant-logos\/[a-f0-9-]+\.png$/);
    assert.deepEqual(await readFile(join(directory, url.split('/').pop()!)), png);
    await service.removeTenantLogo(url);
    await assert.rejects(() => readFile(join(directory, url.split('/').pop()!)));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('tenant logo rejects disguised non-image content', async () => {
  const service = new MediaStorageService();
  await assert.rejects(() => service.replaceTenantLogo(null, { buffer: Buffer.from('not an image'), originalname: 'fake.png' }), BadRequestException);
});
