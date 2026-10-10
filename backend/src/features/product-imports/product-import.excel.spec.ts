import assert from 'node:assert/strict';
import test from 'node:test';
import ExcelJS from 'exceljs';
import { parseProductImport, productImportTemplate, productResultsWorkbook, productValidationWorkbook } from './product-import.excel';
import { PRODUCT_SHEETS, PRODUCT_IMPORT_SPECS } from './product-import.schema';
import { currency, operation, optionalBoolean, optionalDate } from './product-import.values';

test('combined workbook contains all ten dependency-ordered sheets and parses cross-sheet keys', async () => {
  const buffer = await productImportTemplate('onboarding', true);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  assert.deepEqual(workbook.worksheets.slice(0, 10).map((sheet) => sheet.name), PRODUCT_SHEETS.map((sheet) => PRODUCT_IMPORT_SPECS[sheet].name));
  const rows = await parseProductImport(buffer, 'onboarding');
  assert.equal(rows.length, 10);
  assert.ok(rows.every((row) => row.values.ProductImportKey === 'P001'));
  assert.equal(rows.find((row) => row.sheet === 'selling-discounts')?.values.DiscountType, 'PERCENTAGE');
});

test('individual templates use ERP SKU, and Product Master creation remains unposted staging data', async () => {
  const units = await parseProductImport(await productImportTemplate('product-units', true), 'product-units');
  assert.equal(units[0].values.SKU, 'SKU-000001');
  assert.equal(units[0].values.ProductImportKey, '');
  const products = await parseProductImport(await productImportTemplate('products', true), 'products');
  assert.equal(products[0].values.ProductImportKey, 'P001');
  assert.equal(products[0].values.IsSellable, 'false');
  assert.equal(products[0].values.IsPurchasable, 'false');
  const maintenance = await parseProductImport(await productImportTemplate('selling-prices', true), 'selling-prices');
  assert.ok(new Date(maintenance[0].values.EffectiveFrom).getTime() > Date.now());
  const identifiers = await parseProductImport(await productImportTemplate('identifiers', true), 'identifiers');
  assert.equal(identifiers[0].values.Operation, 'UPDATE');
  assert.equal(identifiers[0].values.ExistingIdentifierValue, '8901234567001');
  assert.equal(identifiers[0].values.IdentifierValue, '8901234567002');
  const onboardingIdentifiers = (await parseProductImport(await productImportTemplate('onboarding', true), 'onboarding'))
    .find((item) => item.sheet === 'identifiers');
  assert.equal(onboardingIdentifiers?.values.ExistingIdentifierValue, undefined);
});

test('legacy individual identifier sheets remain readable with a blank old-value target', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await productImportTemplate('identifiers', true) as any);
  const sheet = workbook.getWorksheet('03 Identifiers')!;
  let oldColumn = 0;
  sheet.getRow(1).eachCell((cell, index) => { if (cell.value === 'ExistingIdentifierValue') oldColumn = index; });
  sheet.spliceColumns(oldColumn, 1);
  const rows = await parseProductImport(Buffer.from(await workbook.xlsx.writeBuffer()), 'identifiers');
  assert.equal(rows[0].values.ExistingIdentifierValue, undefined);
});

test('parser rejects formulas, changed headers and empty data sheets', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await productImportTemplate('selling-prices', true) as any);
  const sheet = workbook.getWorksheet('04 Selling Prices')!;
  sheet.getRow(2).getCell(6).value = { formula: '1+1', result: 2 };
  await assert.rejects(parseProductImport(Buffer.from(await workbook.xlsx.writeBuffer()), 'selling-prices'), /Formula is not allowed/);
  sheet.getRow(2).getCell(6).value = 200;
  sheet.getRow(1).getCell(1).value = 'Wrong header';
  await assert.rejects(parseProductImport(Buffer.from(await workbook.xlsx.writeBuffer()), 'selling-prices'), /Invalid headers/);
  sheet.getRow(1).getCell(1).value = 'ProductImportKey';
  sheet.spliceRows(2, 1);
  await assert.rejects(parseProductImport(Buffer.from(await workbook.xlsx.writeBuffer()), 'selling-prices'), /no populated data rows/);
});

test('result workbook includes generated SKU, operation, status and revision impact', async () => {
  const buffer = await productResultsWorkbook([{ sheet: 'selling-prices', rowNumber: 8,
    values: { ProductImportKey: '', SKU: 'SKU-000001', PriceListCode: 'RET' }, sku: 'SKU-000001',
    action: 'REVISE', status: 'COMPLETED', details: 'Applied', oldValue: '180.00', newValue: '200.00',
    oldEnd: '2026-10-31T23:59:59.999Z', newStart: '2026-11-01' }]);
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(buffer as any);
  const row = workbook.getWorksheet('Results')!.getRow(2);
  assert.equal(row.getCell(3).value, 'SKU-000001');
  assert.equal(row.getCell(6).value, 'REVISE');
  assert.equal(row.getCell(9).value, '180.00');
  assert.equal(row.getCell(12).value, '2026-11-01');
});

test('validation report includes all source sheets, skipped rows, full reasons and safe formula-like text', async () => {
  const rows = Array.from({ length: 1201 }, (_, index) => ({ sheet: index % 2 ? 'identifiers' : 'selling-prices', rowNumber: index + 2,
    values: { SKU: 'SKU-000013', Operation: index % 3 ? 'CREATE' : 'UPDATE', IdentifierValue: '=HYPERLINK("evil")',
      ExistingIdentifierValue: 'OLD', PriceListCode: 'RET', UnitCode: 'EA' }, sku: 'SKU-000013',
    action: index % 3 ? 'ERROR' : 'SKIP', status: index % 3 ? 'ERROR' : 'SKIPPED',
    details: index % 3 ? '=Invalid barcode with full reason' : 'Explicitly skipped.', oldValue: 'OLD', newValue: '+NEW',
    oldEnd: '2026-10-01', newStart: '2026-11-01' })) as any;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await productValidationWorkbook(rows) as any);
  const sheet = workbook.getWorksheet('Validation Report')!;
  assert.equal(sheet.rowCount, 1202);
  assert.equal(sheet.getRow(2).getCell(1).value, '04 Selling Prices');
  assert.equal(sheet.getRow(3).getCell(1).value, '03 Identifiers');
  assert.equal(sheet.getRow(2).getCell(5).value, 'UPDATE');
  assert.equal(sheet.getRow(2).getCell(6).value, 'SKIPPED');
  assert.equal(sheet.getRow(3).getCell(11).value, "'=Invalid barcode with full reason");
  assert.equal(sheet.getRow(3).getCell(8).value, "'+NEW");
  assert.match(String(sheet.getRow(3).getCell(4).value), /ExistingIdentifierValue: OLD/);
});

test('import scalar validation distinguishes blank from explicit false and rejects ambiguous dates', () => {
  assert.equal(optionalBoolean('', 'Flag'), undefined);
  assert.equal(optionalBoolean('FALSE', 'Flag'), false);
  assert.throws(() => optionalBoolean('yes', 'Flag'), /TRUE or FALSE/);
  assert.equal(operation('', true), 'CREATE');
  assert.throws(() => operation('', false), /explicit/);
  assert.equal(currency('lkr'), 'LKR');
  assert.throws(() => optionalDate('11/01/2026', 'EffectiveFrom'), /YYYY-MM-DD/);
  assert.throws(() => optionalDate('2026-02-31', 'EffectiveFrom'), /impossible calendar date/);
});
