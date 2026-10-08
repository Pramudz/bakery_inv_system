import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { IMPORT_SPECS, Master } from './reference-import.schema';

export interface RawImportRow { rowNumber: number; values: Record<string, unknown> }

const samples: Partial<Record<Master, Record<string, unknown>[]>> = {
  categories: [
    { categoryCode: 'BAKERY', categoryName: 'Bakery', description: 'Fresh baked products', sortOrder: 10 },
    { categoryCode: 'BREAD', categoryName: 'Bread', parentCategoryCode: 'BAKERY', description: 'Loaves and rolls', sortOrder: 20 },
    { categoryCode: 'WHOLEGRAIN', categoryName: 'Wholegrain Bread', parentCategoryCode: 'BREAD', sortOrder: 30 },
  ],
  brands: [{ brandCode: 'SUNRISE', brandName: 'Sunrise Foods', description: 'Everyday grocery brand' }, { brandCode: 'HILLSIDE', brandName: 'Hillside Pantry' }],
  units: [{ code: 'PCS', name: 'Piece', symbol: 'pc', unitType: 'COUNT', allowsDecimalQuantity: false, quantityPrecision: 0 }, { code: 'KG', name: 'Kilogram', symbol: 'kg', unitType: 'WEIGHT', allowsDecimalQuantity: true, quantityPrecision: 3 }],
  suppliers: [{ supplierCode: '', supplierImportRef: 'SAMPLE-SUP-001', supplierName: 'Island Wholesale Foods', isActive: true, contactName: 'Sales Desk', phone: '0112345678', city: 'Colombo', countryCode: 'LK' }, { supplierCode: '', supplierImportRef: 'SAMPLE-SUP-002', supplierName: 'Hill Country Produce', isActive: true, city: 'Kandy', countryCode: 'LK' }],
  'price-lists': [{ code: 'RETAIL-2026', name: 'Retail Prices', priceListType: 'RETAIL', currencyCode: 'LKR', isDefault: true }, { code: 'WHOLESALE-2026', name: 'Wholesale Prices', priceListType: 'WHOLESALE', currencyCode: 'LKR', isDefault: true }],
  locations: [{ code: 'MAIN-STORE', name: 'Main Store', locationType: 'STORE', isActive: true, city: 'Colombo', countryCode: 'LK' }, { code: 'CENTRAL-WH', name: 'Central Warehouse', locationType: 'WAREHOUSE', isActive: true, city: 'Colombo', countryCode: 'LK' }],
};

export async function makeWorkbook(master: Master, sample: boolean): Promise<Buffer> {
  const spec = IMPORT_SPECS[master];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Prosinc ERP';
  const sheet = workbook.addWorksheet('Data', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = spec.columns.map((column) => ({ header: column.header, key: column.field, width: Math.min(36, Math.max(17, column.header.length + 3)) }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B53' } };
  sheet.getRow(1).height = 25;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } };
  for (const row of sample ? samples[master] ?? [] : []) sheet.addRow(row);
  for (let c = 0; c < spec.columns.length; c++) {
    const column = spec.columns[c];
    sheet.getCell(1, c + 1).note = column.hint;
    for (let r = 2; r <= 1001; r++) {
      const cell = sheet.getCell(r, c + 1);
      if (column.type === 'boolean' || column.type === 'enum') {
        cell.dataValidation = { type: 'list', allowBlank: !column.required, formulae: [`"${column.values!.join(',')}"`], showErrorMessage: true, error: 'Select an allowed value.' };
      } else if (column.type === 'integer') {
        cell.dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [column.field === 'quantityPrecision' ? 0 : -2147483648, column.field === 'quantityPrecision' ? 6 : 2147483647], showErrorMessage: true, error: 'Enter a whole number.' };
      } else cell.numFmt = '@';
    }
  }
  const guide = workbook.addWorksheet('Instructions');
  guide.columns = [{ width: 28 }, { width: 105 }];
  guide.addRow(['Reference Master Import', spec.title]);
  guide.addRow(['Process', 'Fill the Data sheet, upload it, validate and preview, then confirm. Existing codes are skipped; no existing records are updated.']);
  guide.addRow(['Tenant', 'Do not include tenant IDs. The signed-in tenant is used.']);
  guide.addRow(['Codes', 'Enter reference codes as text. Category parents use ParentCategoryCode, never database IDs.']);
  guide.addRow(['Suppliers', 'Blank SupplierCode requires a stable SupplierImportRef. Reuse the same reference on retries.']);
  guide.addRow(['Field', 'Requirement / allowed values']);
  for (const column of spec.columns) guide.addRow([column.header, column.hint]);
  guide.getRow(1).font = { bold: true, size: 14 };
  guide.getRow(6).font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function parseWorkbook(buffer: Buffer, master: Master): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(buffer as any); }
  catch { throw new BadRequestException('Invalid .xlsx workbook.'); }
  const sheet = workbook.getWorksheet('Data') ?? workbook.worksheets[0];
  if (!sheet) throw new BadRequestException('Data worksheet is missing.');
  const spec = IMPORT_SPECS[master];
  const headers = spec.columns.map((column) => column.header);
  const actual = Array.from({ length: sheet.getRow(1).cellCount }, (_, i) => String(sheet.getRow(1).getCell(i + 1).value ?? '').trim());
  if (actual.length !== headers.length || headers.some((header, i) => actual[i] !== header)) {
    throw new BadRequestException(`Invalid headers. Expected: ${headers.join(', ')}`);
  }
  if (sheet.rowCount > 1001) throw new BadRequestException('Maximum 1,000 data rows per upload.');
  const rows: RawImportRow[] = [];
  for (let i = 2; i <= sheet.rowCount; i++) {
    const values: Record<string, unknown> = {};
    let populated = false;
    for (let j = 0; j < spec.columns.length; j++) {
      const cell = sheet.getRow(i).getCell(j + 1);
      if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) throw new BadRequestException(`Formula is not allowed at row ${i}.`);
      let value: unknown = cell.value;
      if (value && typeof value === 'object' && 'text' in value) value = (value as { text: string }).text;
      if (value !== null && value !== undefined && value !== '') populated = true;
      values[spec.columns[j].field] = value;
    }
    if (populated) rows.push({ rowNumber: i, values });
  }
  if (!rows.length) throw new BadRequestException('The Data sheet has no records.');
  return rows;
}

export async function resultWorkbook(rows: Array<{ rowNumber: number; action: string; code: string; errors: string[]; values?: Record<string, unknown> }>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Results');
  sheet.columns = [{ header: 'ExcelRow', key: 'rowNumber', width: 14 }, { header: 'Result', key: 'action', width: 16 }, { header: 'Code', key: 'code', width: 28 }, { header: 'SupplierImportRef', key: 'importRef', width: 30 }, { header: 'Record', key: 'record', width: 35 }, { header: 'Errors', key: 'errors', width: 95 }];
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow({ ...row, importRef: String(row.values?.supplierImportRef ?? ''), record: String(row.values?.categoryName ?? row.values?.brandName ?? row.values?.supplierName ?? row.values?.name ?? ''), errors: row.errors.join('; ') });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
