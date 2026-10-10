import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export const OPENING_COLUMNS = ['LocationCode', 'SKU', 'UnitCode', 'Quantity', 'BaseUnitCost', 'Remarks', 'RowReference'] as const;
export type OpeningColumn = typeof OPENING_COLUMNS[number];
export interface OpeningRawRow { rowNumber: number; values: Record<OpeningColumn, string> }
export interface OpeningResultRow extends OpeningRawRow {
  status: 'READY' | 'ERROR' | 'POSTED'; details: string;
  locationId?: number; productId?: number; productUnitId?: number;
  productName?: string; baseUnitCode?: string; conversionFactor?: string;
  baseQuantity?: string; openingValue?: string; existingQuantity?: string; existingWavg?: string;
  historicalMovement?: boolean; openingClaim?: boolean;
  postingDate?: string; adjustmentNumber?: string; adjustmentId?: number; ledgerId?: number;
  finalQuantity?: string; finalWavg?: string;
}

const safe = (value: unknown) => {
  const text = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(text) ? `'${text}` : text;
};
function cellText(cell: ExcelJS.Cell, row: number): string {
  const value = cell.value;
  if (value && typeof value === 'object' && 'formula' in value) throw new BadRequestException(`Formula is not allowed at Opening Stock row ${row}.`);
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'text' in value) return String(value.text).trim();
  if (typeof value === 'object' && 'richText' in value) return (value.richText as Array<{ text: string }>).map(part => part.text).join('').trim();
  return String(value).trim();
}

export async function openingTemplate(sample: boolean): Promise<Buffer> {
  const book = new ExcelJS.Workbook(); book.creator = 'Prosinc ERP';
  const sheet = book.addWorksheet('Opening Stock', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = OPENING_COLUMNS.map(header => ({ header, key: header, width: header === 'Remarks' ? 38 : 22 }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B53' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: OPENING_COLUMNS.length } };
  if (sample) {
    sheet.addRow({ LocationCode: 'DEMO-STORE', SKU: 'DEMO-BISCUIT-001', UnitCode: 'PCS', Quantity: '24', BaseUnitCost: '12.5000', Remarks: 'Fictional example only', RowReference: 'OPEN-001' });
    sheet.addRow({ LocationCode: 'DEMO-WAREHOUSE', SKU: 'DEMO-FLOUR-001', UnitCode: 'BAG', Quantity: '2', BaseUnitCost: '3.2500', Remarks: 'Cost is per base unit, not per bag', RowReference: 'OPEN-002' });
  }
  const guide = book.addWorksheet('Instructions'); guide.columns = [{ width: 31 }, { width: 115 }];
  for (const row of [
    ['Opening Inventory Bulk Import', 'Use existing active tenant products, locations and linked product units. Sample codes are fictional.'],
    ['Process', 'Upload, validate and preview, confirm once, then download results. All rows must pass; one workbook posts atomically.'],
    ['Master codes', 'LocationCode, SKU and UnitCode must already exist for your tenant. Nothing is created automatically.'],
    ['Unit conversion', 'Quantity is in UnitCode. The configured active Product Unit factor converts it to the product base stock unit.'],
    ['BaseUnitCost', 'Cost is always per one base stock unit, even if Quantity is entered as a case, bag or other converted unit.'],
    ['Precision', 'Quantity and BaseUnitCost allow up to four decimal places; conversion factors allow six. Quantity and cost must be greater than zero. Unsafe conversion rounding is rejected.'],
    ['Posting date and age', 'Opening posts on the current tenant business date at confirmation. Historical posting and aging dates are not supported.'],
    ['Once only', 'Each product/location can be opened once. Any previous ledger movement, opening claim or stock state blocks opening, even when current quantity is zero.'],
    ['Tracked products', 'Products requiring batch, expiry or serial tracking are unsupported and rejected. Do not enter lot or serial data.'],
    ['Rows and errors', 'Maximum 1,000 populated rows and 5 MB. Do not use formulas. Download the validation report to review every ERROR; correct and upload a new workbook.'],
    ['RowReference', 'Optional identifier for matching source rows to the final results. It does not authorize a second opening.'],
  ]) guide.addRow(row);
  guide.getRow(1).font = { bold: true, size: 14 };
  return Buffer.from(await book.xlsx.writeBuffer());
}

export async function parseOpeningWorkbook(buffer: Buffer): Promise<OpeningRawRow[]> {
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new BadRequestException('Upload one .xlsx file up to 5 MB.');
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(buffer as any); } catch { throw new BadRequestException('Invalid .xlsx workbook.'); }
  const sheet = book.getWorksheet('Opening Stock');
  if (!sheet) throw new BadRequestException('Missing Opening Stock worksheet.');
  for (const worksheet of book.worksheets) worksheet.eachRow((row, rowNumber) => row.eachCell(cell => {
    if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value)
      throw new BadRequestException(`Formula is not allowed at ${worksheet.name} row ${rowNumber}.`);
  }));
  const actual = Array.from({ length: sheet.getRow(1).cellCount }, (_, i) => cellText(sheet.getRow(1).getCell(i + 1), 1));
  if (actual.length !== OPENING_COLUMNS.length || OPENING_COLUMNS.some((header, index) => actual[index] !== header))
    throw new BadRequestException(`Invalid Opening Stock headers. Expected: ${OPENING_COLUMNS.join(', ')}`);
  if (sheet.actualRowCount > 1001) throw new BadRequestException('Maximum 1,000 populated opening rows.');
  const rows: OpeningRawRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const values = {} as Record<OpeningColumn, string>;
    OPENING_COLUMNS.forEach((header, index) => { values[header] = cellText(sheet.getRow(rowNumber).getCell(index + 1), rowNumber); });
    for (let index = OPENING_COLUMNS.length + 1; index <= sheet.getRow(rowNumber).cellCount; index++)
      if (cellText(sheet.getRow(rowNumber).getCell(index), rowNumber)) throw new BadRequestException(`Unexpected data after RowReference at row ${rowNumber}.`);
    if (Object.values(values).some(Boolean)) rows.push({ rowNumber, values });
    if (rows.length > 1000) throw new BadRequestException('Maximum 1,000 populated opening rows.');
  }
  if (!rows.length) throw new BadRequestException('Workbook has no populated opening rows.');
  return rows;
}

function report(rows: OpeningResultRow[], datasetId: string, completed: boolean): Promise<Buffer> {
  const book = new ExcelJS.Workbook(); book.creator = 'Prosinc ERP';
  const sheet = book.addWorksheet(completed ? 'Results' : 'Validation Report', { views: [{ state: 'frozen', ySplit: 1 }] });
  const columns: Array<[string, (row: OpeningResultRow) => unknown]> = [
    ['Dataset ID', () => datasetId], ['Sheet', () => 'Opening Stock'], ['Excel Row', row => row.rowNumber],
    ['RowReference', row => row.values.RowReference], ['SKU', row => row.values.SKU], ['Location', row => row.values.LocationCode],
    ['Product Name', row => row.productName], ['Unit', row => row.values.UnitCode], ['Entered Quantity', row => row.values.Quantity],
    ['Conversion Factor', row => row.conversionFactor], ['Base Unit', row => row.baseUnitCode], ['Base Quantity', row => row.baseQuantity],
    ['Base Unit Cost', row => row.values.BaseUnitCost], ['Opening Value', row => row.openingValue],
    ['Existing Quantity', row => row.existingQuantity], ['Existing WAVG', row => row.existingWavg],
    ['Historical Movement', row => row.historicalMovement ? 'YES' : 'NO'], ['Opening Claim', row => row.openingClaim ? 'YES' : 'NO'],
    ['Status', row => row.status], ['Complete Reason', row => row.details],
  ];
  if (completed) columns.push(
    ['Posting Date', row => row.postingDate], ['Adjustment', row => row.adjustmentNumber], ['Adjustment ID', row => row.adjustmentId],
    ['Ledger ID', row => row.ledgerId], ['Final Quantity', row => row.finalQuantity], ['Final WAVG', row => row.finalWavg]);
  sheet.columns = columns.map(([header]) => ({ header, width: header === 'Complete Reason' ? 85 : 23 }));
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF213B53' } };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const row of rows) sheet.addRow(columns.map(([, value]) => safe(value(row))));
  return book.xlsx.writeBuffer().then(value => Buffer.from(value));
}
export const openingValidationWorkbook = (rows: OpeningResultRow[], datasetId: string) => report(rows, datasetId, false);
export const openingResultsWorkbook = (rows: OpeningResultRow[], datasetId: string) => report(rows, datasetId, true);
