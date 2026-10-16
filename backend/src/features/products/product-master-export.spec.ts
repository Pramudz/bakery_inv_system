import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryLevels, consolidatedWavg, csvCell, ITEM_MASTER_HEADERS, parseItemMasterQuery, ProductMasterExportService } from './product-master-export.service';
import { ProductController } from './products.controller';
import { REQUIRE_PERMISSION } from '../auth/require-permission.decorator';

test('export has the exact 24 columns and spreadsheet-safe escaped values', () => {
  assert.equal(ITEM_MASTER_HEADERS.length, 24);
  assert.equal(ITEM_MASTER_HEADERS[0], 'SKU');
  assert.equal(ITEM_MASTER_HEADERS[23], 'Product Type');
  assert.equal(csvCell('Cake, "special"\nsecond line'), '"Cake, ""special""\nsecond line"');
  assert.equal(csvCell('=HYPERLINK("evil")'), '"\'=HYPERLINK(""evil"")"');
  assert.equal(csvCell('0012345'), '"0012345"');
  assert.equal(csvCell(null), '""');
});

test('category levels walk from root and fail closed on broken or cyclic parents', () => {
  const categories = new Map<number, any>([[1, { category_name: 'Beverages', parent_category_id: null }],
    [2, { category_name: 'Soft drinks', parent_category_id: 1 }], [3, { category_name: 'Carbonated', parent_category_id: 2 }],
    [4, { category_name: 'Broken', parent_category_id: 99 }], [5, { category_name: 'Loop', parent_category_id: 5 }]]);
  assert.deepEqual(categoryLevels(1, categories), ['Beverages', '', '']);
  assert.deepEqual(categoryLevels(2, categories), ['Beverages', 'Soft drinks', '']);
  assert.deepEqual(categoryLevels(3, categories), ['Beverages', 'Soft drinks', 'Carbonated']);
  assert.deepEqual(categoryLevels(4, categories), ['', '', '']);
  assert.deepEqual(categoryLevels(5, categories), ['', '', '']);
});

test('tenant valuation weights on-hand and outstanding transfer value; zero quantity is blank', () => {
  assert.equal(consolidatedWavg([{quantity_on_hand:'100', average_cost:'80'}, {quantity_on_hand:'50', average_cost:'100'}, {quantity_on_hand:'50', average_cost:'90'}], []), '87.5000');
  assert.equal(consolidatedWavg([{quantity_on_hand:'100', average_cost:'80'}], [{outstanding_qty:'10', outstanding_value:'900'}]), '80.9091');
  assert.equal(consolidatedWavg([{quantity_on_hand:'0', average_cost:'80'}], []), '');
});

test('scope, identifiers and tenant-wide role restriction are checked before querying export data', async () => {
  assert.deepEqual(Reflect.getMetadata(REQUIRE_PERMISSION, ProductController.prototype.exportItemMaster), ['PRODUCT_VIEW', 'PRODUCT_MASTER_COST_EXPORT']);
  assert.deepEqual(Reflect.getMetadata(REQUIRE_PERMISSION, ProductController.prototype.exportItemMasterOptions), ['PRODUCT_VIEW', 'PRODUCT_MASTER_COST_EXPORT']);
  assert.throws(() => parseItemMasterQuery({scope:'LOCATION',priceListId:'1'}), /Location ID/);
  assert.throws(() => parseItemMasterQuery({scope:'TENANT',priceListId:'1',locationId:'2'}), /does not accept/);
  assert.throws(() => parseItemMasterQuery({scope:'TENANT',priceListId:'1',categoryId:'oops'}), /Category ID/);
  let queried = false;
  const service = new ProductMasterExportService({transaction: async () => { queried = true; }} as any);
  await assert.rejects(service.export({tenantId:1,accessScope:'LOCATION',assignedLocationIds:[2]} as any,{scope:'TENANT',priceListId:'1'}), /tenant-wide role/i);
  await assert.rejects(service.export({tenantId:1,accessScope:'LOCATION',assignedLocationIds:[2]} as any,{scope:'LOCATION',priceListId:'1',locationId:'3'}), /access to this location/i);
  assert.equal(queried, false);
});
