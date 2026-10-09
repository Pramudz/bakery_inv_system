import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { makeWorkbook, parseWorkbook, RawImportRow } from './reference-import.excel';
import { IMPORT_SPECS, MASTERS, Master } from './reference-import.schema';
import { validateImportRows } from './reference-import.validation';

const raw = (values: Record<string, unknown>, rowNumber = 2): RawImportRow[] => [{ rowNumber, values }];
const valid: Record<Master, Record<string, unknown>> = {
  categories: { categoryCode: 'BAKERY', categoryName: 'Bakery' },
  brands: { brandCode: 'SUNRISE', brandName: 'Sunrise Foods' },
  units: { code: 'PCS', name: 'Piece', unitType: 'COUNT' },
  suppliers: { supplierName: 'Island Wholesale Foods', supplierImportRef: 'S-001' },
  'price-lists': { code: 'RETAIL', name: 'Retail', priceListType: 'RETAIL', currencyCode: 'LKR' },
  locations: { code: 'main', name: 'Main Store', locationType: 'STORE', isActive: true },
};
for (const master of MASTERS) {
  test(`${master}: sample workbook round trips and blank template has exact headers`, async () => {
    const sample = await parseWorkbook(await makeWorkbook(master, true), master);
    assert.ok(sample.length >= 2);
    const results = validateImportRows(master, sample, []);
    assert.equal(results.every((row) => row.action === 'CREATE'), true, JSON.stringify(results));
    const blank = new ExcelJS.Workbook();
    await blank.xlsx.load(await makeWorkbook(master, false) as any);
    assert.deepEqual(IMPORT_SPECS[master].columns.map((_, i) => blank.getWorksheet('Data')!.getRow(1).getCell(i + 1).value), IMPORT_SPECS[master].columns.map((column) => column.header));
    await assert.rejects(parseWorkbook(await makeWorkbook(master, false), master), /no records/);
  });
  test(`${master}: required field, file duplicate, tenant record`, () => {
    const data = valid[master];
    const codeField = IMPORT_SPECS[master].codeField;
    const first = validateImportRows(master, raw(data), []);
    assert.equal(first[0].action, 'CREATE', JSON.stringify(first));
    const missing = { ...data, [master === 'suppliers' ? 'supplierName' : codeField]: '' };
    assert.equal(validateImportRows(master, raw(missing), [])[0].action, 'ERROR');
    const twice = validateImportRows(master, [{ rowNumber: 2, values: data }, { rowNumber: 3, values: data }], []);
    assert.equal(twice[1].action, 'ERROR');
    const existing = { ...data, [codeField]: master === 'suppliers' ? 'SUP-000001' : data[codeField] };
    const repeat = master === 'suppliers'
      ? validateImportRows(master, raw(data), [existing], [{ importRef: 'S-001', supplierCode: 'SUP-000001' }])
      : validateImportRows(master, raw(data), [existing]);
    assert.equal(repeat[0].action, 'SKIP', JSON.stringify(repeat));
  });
}

test('categories resolve in-file parents, reject cycles and a fourth level', () => {
  const rows = [
    { rowNumber: 2, values: { categoryCode: 'A', categoryName: 'A' } },
    { rowNumber: 3, values: { categoryCode: 'B', categoryName: 'B', parentCategoryCode: 'A' } },
    { rowNumber: 4, values: { categoryCode: 'C', categoryName: 'C', parentCategoryCode: 'B' } },
    { rowNumber: 5, values: { categoryCode: 'D', categoryName: 'D', parentCategoryCode: 'C' } },
  ];
  assert.deepEqual(validateImportRows('categories', rows, []).map((r) => r.action), ['CREATE','CREATE','CREATE','ERROR']);
  const cyclic = rows.slice(0, 2).map((r) => ({ ...r, values: { ...r.values } }));
  cyclic[0].values.parentCategoryCode = 'B';
  assert.deepEqual(validateImportRows('categories', cyclic, []).map((r) => r.action), ['ERROR','ERROR']);
  assert.equal(validateImportRows('categories', raw({ categoryCode: 'X', categoryName: 'X', parentCategoryCode: 'MISSING' }), [])[0].action, 'ERROR');
});

test('suppliers require a stable reference for generated codes and reuse tenant mapping', () => {
  assert.equal(validateImportRows('suppliers', raw({ supplierName: 'Demo' }), [])[0].action, 'ERROR');
  const created = validateImportRows('suppliers', raw({ supplierName: 'Demo', supplierImportRef: 'ref-1' }), []);
  assert.equal(created[0].action, 'CREATE');
  const repeated = validateImportRows('suppliers', raw({ supplierName: 'Demo', supplierImportRef: 'REF-1' }), [], [{ importRef: 'ref-1', supplierCode: 'SUP-000123' }]);
  assert.equal(repeated[0].action, 'SKIP');
  assert.equal(repeated[0].code, 'SUP-000123');
});

test('new supplier header and legacy SupplierImportRef header both parse', async () => {
  const buffer = await makeWorkbook('suppliers', true);
  const modern = await parseWorkbook(buffer, 'suppliers');
  assert.equal(modern[0].values.supplierImportRef, 'S001');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  workbook.getWorksheet('Data')!.getRow(1).getCell(2).value = 'SupplierImportRef';
  const legacy = await parseWorkbook(Buffer.from(await workbook.xlsx.writeBuffer()), 'suppliers');
  assert.deepEqual(legacy, modern);
});

test('price list validation prevents ambiguous defaults without changing ordinary CRUD', () => {
  const two = validateImportRows('price-lists', [
    { rowNumber: 2, values: { code: 'R1', name: 'Retail One', priceListType: 'RETAIL', isDefault: true } },
    { rowNumber: 3, values: { code: 'R2', name: 'Retail Two', priceListType: 'RETAIL', isDefault: true } },
  ], []);
  assert.deepEqual(two.map((row) => row.action), ['ERROR', 'ERROR']);
  assert.equal(validateImportRows('price-lists', raw({ code: 'R3', name: 'Retail Three', priceListType: 'RETAIL', isDefault: true }), [{ code: 'R0', isActive: true, isDefault: true, priceListType: 'RETAIL' }])[0].action, 'ERROR');
  assert.equal(validateImportRows('price-lists', raw({ code: 'W1', name: 'Wholesale', priceListType: 'WHOLESALE', isDefault: true }), [{ code: 'W0', isActive: true, isDefault: true, priceListType: 'WHOLE' }])[0].action, 'ERROR');
  assert.equal(validateImportRows('price-lists', raw({ code: 'ONLINE', name: 'Online', priceListType: 'ONLINE', isDefault: true }), [])[0].action, 'CREATE');
});

test('locations normalize code and reject unsupported type; units reject invalid precision', () => {
  assert.equal(validateImportRows('locations', raw(valid.locations), [])[0].code, 'MAIN');
  assert.equal(validateImportRows('locations', raw({ ...valid.locations, locationType: 'FACTORY' }), [])[0].action, 'ERROR');
  assert.equal(validateImportRows('locations', raw({ ...valid.locations, phone: 112345678 }), [])[0].action, 'ERROR');
  assert.equal(validateImportRows('units', raw({ ...valid.units, quantityPrecision: 7 }), [])[0].action, 'ERROR');
});
