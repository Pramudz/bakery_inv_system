import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { IdentifierTypeService } from './identifier-types.service';

test('system identifier codes cannot be renamed, case changed or deactivated', async () => {
  const rows: any[] = [{ identifierTypeId: 1, code: 'BARCODE', name: 'Barcode', isActive: true },
    { identifierTypeId: 2, code: 'CUSTOM', name: 'Custom', isActive: true }];
  const service = new IdentifierTypeService({
    findOneBy: async ({ identifierTypeId }: any) => rows.find(row => row.identifierTypeId === identifierTypeId) ?? null,
    update: async (id: number, changes: any) => Object.assign(rows.find(row => row.identifierTypeId === id), changes),
  } as any);
  await assert.rejects(service.update(1, { code: 'barcode' }), /cannot be changed/i);
  await assert.rejects(service.update(1, { code: 'UPC' }), /cannot be changed/i);
  await assert.rejects(service.deactivate(1), /cannot be deactivated/i);
  await service.update(1, { name: 'Item barcode' });
  assert.equal(rows[0].code, 'BARCODE');
  await service.deactivate(2);
  assert.equal(rows[1].isActive, false);
});
