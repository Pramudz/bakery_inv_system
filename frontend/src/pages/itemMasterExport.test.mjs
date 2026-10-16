import assert from 'node:assert/strict';
import test from 'node:test';
import { itemMasterExportPath, itemMasterFilename } from '../features/products/itemMasterExport.ts';

test('item master export passes filters and scope to the backend', () => {
  const path = itemMasterExportPath({ scope: 'LOCATION', priceListId: '5', locationId: '8', search: 'Cake & tea', status: 'inactive', categoryId: '3' });
  const url = new URL(path, 'http://localhost');
  assert.equal(url.pathname, '/products/export/item-master');
  assert.deepEqual(Object.fromEntries(url.searchParams), { scope: 'LOCATION', priceListId: '5', search: 'Cake & tea', status: 'inactive', categoryId: '3', locationId: '8' });
  assert.equal(itemMasterFilename('LOCATION', '2026-10-17', 'W 01/2'), 'item-master-location-W_01_2-2026-10-17.csv');
});

test('tenant export omits a retained location selection', () => {
  const path = itemMasterExportPath({ scope: 'TENANT', priceListId: '5', locationId: '8', search: '', status: '', categoryId: '' });
  assert.equal(new URL(path, 'http://localhost').searchParams.has('locationId'), false);
  assert.equal(itemMasterFilename('TENANT', '2026-10-17'), 'item-master-tenant-2026-10-17.csv');
});
