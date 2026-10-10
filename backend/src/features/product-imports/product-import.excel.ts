import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { PRODUCT_IMPORT_SPECS, PRODUCT_SHEETS, ProductImportSheet, ProductImportType, productImportColumns } from './product-import.schema';

export interface ProductRawRow { sheet: ProductImportSheet; rowNumber: number; values: Record<string, string> }
const headers = (sheet: ProductImportSheet, type: ProductImportType) => productImportColumns(sheet, type).map((column) => column.header);

export async function productImportTemplate(type: ProductImportType, sample: boolean): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Prosinc ERP';
  for (const typeName of type === 'onboarding' ? PRODUCT_SHEETS : [type]) {
    const spec = PRODUCT_IMPORT_SPECS[typeName];
    const sheet = workbook.addWorksheet(spec.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    const columns = productImportColumns(typeName, type);
    sheet.columns = columns.map((column) => ({ header: column.header, key: column.header, width: Math.min(34, Math.max(17, column.header.length + 3)) }));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B53' } };
    sheet.getRow(1).height = 26;
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    columns.forEach((column, i) => { sheet.getRow(1).getCell(i + 1).note = `${column.required ? 'Required on creation. ' : ''}${column.hint}`; });
    if (sample) spec.sample.forEach((row) => {
      if (type === 'onboarding') sheet.addRow(row);
      else if (typeName === 'products') sheet.addRow({ ...row, IsSellable: false, IsPurchasable: false, IsStockItem: false });
      else {
        const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        sheet.addRow({ ...row, ProductImportKey: '', SKU: 'SKU-000001',
          ...(typeName === 'identifiers' ? { Operation: 'UPDATE', ExistingIdentifierValue: row.IdentifierValue, IdentifierValue: '8901234567002' } : {}),
          ...(row.EffectiveFrom ? { EffectiveFrom: futureDate } : {}) });
      }
    });
  }
  const guide = workbook.addWorksheet('Instructions');
  guide.columns = [{ width: 32 }, { width: 116 }];
  const instructions: [string, string][] = [
    ['Product Bulk Import', type === 'onboarding' ? 'Complete product onboarding' : PRODUCT_IMPORT_SPECS[type].name],
    ['Process', 'Upload, validate and preview, then explicitly confirm. Only confirmed operations change business records.'],
    ['Dataset ID', 'For onboarding, enter a stable Dataset ID in the UI. ProductImportKey is unique within that dataset and maps durably to the generated SKU.'],
    ['Product identity', 'Use ProductImportKey for onboarding; use actual ERP SKU for individual maintenance. Product names are never used to match existing products.'],
    ['Codes', 'Use existing tenant master codes. This import does not create categories, brands, units, suppliers, price lists, locations or attributes.'],
    ['Operations', 'Onboarding creates products. Individual sheets use explicit CREATE, UPDATE, REVISE, END or SKIP where supported; blank optional cells do not clear data.'],
    ['Dates', 'Onboarding uses YYYY-MM-DD tenant business dates, matching Product Wizard. Maintenance accepts YYYY-MM-DD or ISO 8601 date-time with offset. Date-only starts use tenant midnight; date-only ends include the entire tenant day. Maintenance prices and discounts cannot be backdated.'],
    ['Supplier price precision', 'Supplier purchase prices are stored to whole seconds. Maintenance ISO timestamps must use whole-second precision; a date-only end resolves to the last stored second of the tenant day.'],
    ['Maintenance price end', 'For selling or supplier price maintenance, EffectiveTo is supported with END. CREATE and REVISE create open-ended versions; use a later END operation to close one.'],
    ['Currency', 'Use three-letter codes such as LKR. POS display paths currently assume LKR; configure alternate currencies only after reviewing those paths.'],
    ['Boolean', 'Use TRUE or FALSE. Blank applies the documented create default and leaves an existing value unchanged.'],
    ['Price history', 'REVISE ends the matching previous price then creates a new version atomically. Historical amounts and posted transactions are preserved.'],
    ['Discounts', 'A selling-price revision ends discounts attached to the old price. A new discount must be explicitly supplied for the replacement price.'],
    ['Purchase units', 'A supplier purchase unit references a Product Unit. Supplier-specific packaging requires an appropriate Product Unit conversion; existing conversion factors are protected.'],
    ['Rows', 'Maximum 1,000 populated data rows per worksheet. Formula cells are rejected. Product images and inventory opening balances are outside this import.'],
    ['Field', 'Definition'],
  ];
  for (const row of instructions) guide.addRow(row);
  for (const sheetName of type === 'onboarding' ? PRODUCT_SHEETS : [type]) {
    guide.addRow([PRODUCT_IMPORT_SPECS[sheetName].name, '']);
    for (const column of productImportColumns(sheetName, type)) guide.addRow([column.header, `${column.required ? 'Required on creation. ' : ''}${column.hint}`]);
  }
  guide.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function cellText(cell: ExcelJS.Cell, sheet: string, row: number): string {
  const value = cell.value;
  if (value && typeof value === 'object' && 'formula' in value) throw new BadRequestException(`Formula is not allowed at ${sheet} row ${row}.`);
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  if (typeof value === 'object' && 'richText' in value) return (value.richText as Array<{ text: string }>).map((part) => part.text).join('').trim();
  return String(value).trim();
}

export async function parseProductImport(buffer: Buffer, type: ProductImportType): Promise<ProductRawRow[]> {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new BadRequestException('Upload one .xlsx file up to 5 MB.');
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as any); }
  catch { throw new BadRequestException('Invalid .xlsx workbook.'); }
  const result: ProductRawRow[] = [];
  for (const sheetName of type === 'onboarding' ? PRODUCT_SHEETS : [type]) {
    const spec = PRODUCT_IMPORT_SPECS[sheetName];
    const sheet = workbook.getWorksheet(spec.name);
    if (!sheet) throw new BadRequestException(`Missing worksheet ${spec.name}.`);
    const expected = headers(sheetName, type);
    const actual = Array.from({ length: sheet.getRow(1).cellCount }, (_, i) => cellText(sheet.getRow(1).getCell(i + 1), spec.name, 1));
    const legacy = type === 'identifiers' ? headers(sheetName, 'onboarding') : [];
    const activeHeaders = actual.length === legacy.length && legacy.every((header, index) => actual[index] === header) ? legacy : expected;
    if (actual.length !== activeHeaders.length || activeHeaders.some((header, index) => actual[index] !== header))
      throw new BadRequestException(`Invalid headers in ${spec.name}. Expected: ${expected.join(', ')}`);
    if (sheet.rowCount > 1001) throw new BadRequestException(`Maximum 1,000 rows in ${spec.name}.`);
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const values: Record<string, string> = {};
      activeHeaders.forEach((header, index) => { values[header] = cellText(sheet.getRow(rowNumber).getCell(index + 1), spec.name, rowNumber); });
      if (Object.values(values).some(Boolean)) result.push({ sheet: sheetName, rowNumber, values });
    }
  }
  if (!result.length) throw new BadRequestException('Workbook has no populated data rows.');
  if (type === 'onboarding' && !result.some((row) => row.sheet === 'products')) throw new BadRequestException('Onboarding requires at least one product.');
  return result;
}

export interface ProductResultRow extends ProductRawRow {
  action: 'CREATE' | 'UPDATE' | 'REVISE' | 'END' | 'SKIP' | 'ERROR';
  status: 'READY' | 'COMPLETED' | 'SKIPPED' | 'ERROR';
  sku: string;
  details: string;
  oldValue?: string;
  newValue?: string;
  oldEnd?: string;
  newStart?: string;
  recordId?: number;
  parentId?: number;
  stateHash?: string;
}

export async function productResultsWorkbook(rows: ProductResultRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Excel Row', key: 'rowNumber', width: 13 }, { header: 'ProductImportKey', key: 'importKey', width: 24 },
    { header: 'SKU', key: 'sku', width: 22 }, { header: 'Record Type', key: 'sheet', width: 27 },
    { header: 'Record Code / Relationship Key', key: 'key', width: 38 }, { header: 'Operation', key: 'action', width: 16 },
    { header: 'Status', key: 'status', width: 16 }, { header: 'Details / Reason', key: 'details', width: 80 },
    { header: 'Old Value', key: 'oldValue', width: 20 }, { header: 'New Value', key: 'newValue', width: 20 },
    { header: 'Old End Date', key: 'oldEnd', width: 25 }, { header: 'New Start Date', key: 'newStart', width: 25 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B53' } };
  for (const row of rows) sheet.addRow({ rowNumber: row.rowNumber, importKey: row.values.ProductImportKey, sku: row.sku,
    sheet: PRODUCT_IMPORT_SPECS[row.sheet].name, key: row.values.PriceListCode || row.values.SupplierCode || row.values.UnitCode || row.values.LocationCode || row.values.AttributeCode || row.values.IdentifierValue || '',
    action: row.action, status: row.status, details: row.details, oldValue: row.oldValue, newValue: row.newValue, oldEnd: row.oldEnd, newStart: row.newStart });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const safeExcelText = (value: unknown): string => {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
};

export async function productValidationWorkbook(rows: ProductResultRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Prosinc ERP';
  const sheet = workbook.addWorksheet('Validation Report', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: 'Original Worksheet', key: 'sheet', width: 30 }, { header: 'Excel Row', key: 'row', width: 13 },
    { header: 'ProductImportKey / SKU', key: 'product', width: 30 }, { header: 'Context / Identifiers', key: 'context', width: 70 },
    { header: 'Requested Operation', key: 'operation', width: 21 }, { header: 'Validation Status', key: 'status', width: 20 },
    { header: 'Existing Value', key: 'oldValue', width: 25 }, { header: 'Proposed Value', key: 'newValue', width: 25 },
    { header: 'Old Effective End', key: 'oldEnd', width: 27 }, { header: 'Proposed Effective Start', key: 'newStart', width: 29 },
    { header: 'Full Error / Skip Reason', key: 'reason', width: 95 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B53' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  for (const row of rows) {
    const context = ['ProductName', 'CategoryCode', 'BrandCode', 'BaseUnitCode', 'IdentifierTypeCode', 'ExistingIdentifierValue',
      'IdentifierValue', 'PriceListCode', 'SupplierCode', 'SupplierProductCode', 'UnitCode', 'LocationCode', 'AttributeCode',
      'CurrencyCode', 'MinimumQuantity', 'EffectiveFrom', 'EffectiveTo']
      .filter((field) => row.values[field]).map((field) => `${field}: ${row.values[field]}`).join(' | ');
    sheet.addRow({ sheet: safeExcelText(PRODUCT_IMPORT_SPECS[row.sheet].name), row: row.rowNumber,
      product: safeExcelText(row.values.ProductImportKey || row.values.SKU || row.sku), context: safeExcelText(context),
      operation: safeExcelText(row.values.Operation || row.action), status: row.status,
      oldValue: safeExcelText(row.oldValue), newValue: safeExcelText(row.newValue || row.values.IdentifierValue || row.values.SellingPrice || row.values.PurchasePrice || row.values.DiscountValue || row.values.Value || row.values.ProductName),
      oldEnd: safeExcelText(row.oldEnd), newStart: safeExcelText(row.newStart), reason: safeExcelText(row.details) });
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
