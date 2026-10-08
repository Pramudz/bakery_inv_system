import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { RECEIPT_COLUMNS, receiptLines, renderEscPos } from './receipt.mjs';
import { deliver } from './transports.mjs';

const sale = {
  documentType: 'SALE', businessDate: '2026-10-08', issuedAt: '2026-10-08T00:04:00.000Z',
  printedLocationCode: '105', printedRegisterCode: 'POS-01', billNo: 1, saleType: 'RETAIL',
  header: { companyName: 'PRAMUD KUMARAGE', locationName: 'Anuradhapura', locationAddress: ['Address Line -1', 'Address Line -02'], cashierCode: '001', cashierName: 'Administrator', timeZone: 'Asia/Colombo' },
  customer: { customerName: 'No customer selected' },
  details: [{ lineNumber: 1, quantity: '5', unitPrice: '200', discountAmount: '0', netTotal: '1000', product: { sku: 'SKU-000013', productName: 'Astra Margarin 500G Tub' }, cost: '9999', cogs: '9999', wavg: '9999' }],
  subtotal: '1000', discountTotal: '0', grandTotal: '1000', tenderedAmount: '5000', paidAmount: '1000', balanceAmount: '0', changeAmount: '4000',
  payments: [{ amount: '1000', paymentMethod: { paymentMethodName: 'CASH' } }],
};
const refund = {
  ...sale, documentType: 'REFUND', refundNo: 2, reason: 'Customer return', subtotal: '100', discountTotal: '5', refundTotal: '95',
  originalSale: { businessDate: sale.businessDate, locationCode: '105', registerCode: 'POS-01', billNo: 1 },
  details: [{ lineNumber: 1, quantity: '1', unitPrice: '100', discountAmount: '5', refundAmount: '95', product: { sku: 'SKU-000013', productName: 'Astra Margarin 500G Tub' }, originalUnitCost: '9999' }],
  payments: [{ amount: '95', paymentMethod: { paymentMethodName: 'CARD' }, paymentChannel: { name: 'VISA' }, referenceNumber: 'CARD-77' }],
};
const printer = { paperWidth: 80, encoding: 'CP437', cutEnabled: true };

// These are exactly the commands emitted by receipt.mjs; leave printable text intact.
function stripEscPos(bytes) {
  const text = [];
  for (let i = 0; i < bytes.length;) {
    if (bytes[i] === 0x1b) { i += [0x40, 0x32].includes(bytes[i + 1]) ? 2 : 3; continue; }
    if (bytes[i] === 0x1d) { i += 3; continue; }
    text.push(bytes[i++]);
  }
  return Buffer.from(text).toString('latin1');
}
const row = (lines, label) => lines.find((line) => line.startsWith(label));

test('80 mm sale follows preview hierarchy, fixed columns, and new Prosinc footer', () => {
  const lines = receiptLines(sale, 80, true);
  assert.equal(RECEIPT_COLUMNS[80], 48);
  assert.ok(lines.every((line) => line.length <= 48));
  assert.ok(lines.filter((line) => /^-+$/.test(line)).every((line) => line.length === 48));
  assert.ok(lines.indexOf('PRAMUD KUMARAGE') < lines.indexOf('SALE RECEIPT - COPY'));
  assert.ok(lines.some((line) => line.includes('Bill No: 0001') && line.includes('Date: 08/10/2026 05:34')));
  assert.ok(lines.some((line) => line.includes('Location: 105') && line.includes('POS/Register: POS-01')));
  for (const label of ['Cashier: 001 / Administrator', 'Customer: No customer selected', 'Sale Type: Retail', 'Payment: CASH', 'S/N CODE  ITEM NAME']) assert.ok(lines.includes(label), label);
  assert.ok(lines.some((line) => line.startsWith('1. SKU-000013  Astra Margarin 500G Tub')));
  assert.ok(lines.some((line) => /5\.000\s+200\.00\s+0\.00\s+1,000\.00$/.test(line)));
  for (const label of ['Items count', 'Subtotal', 'Total discount', 'Original Total', 'Tendered', 'Paid Amount', 'Outstanding Balance', 'Change Given', 'Payment method', 'CASH', 'Payment status']) assert.ok(row(lines, label), label);
  assert.equal(row(lines, 'Payment status').trimEnd().split(/\s+/).slice(-2).join(' '), 'FULL PAID');
  assert.ok(lines.includes('Thank you for shopping with us!'));
  assert.ok(lines.includes('Software by Prosinc :'));
  assert.ok(lines.includes('+94 71 776 8726 / +94 71 300 1389'));
  assert.ok(!lines.join('\n').includes('07111111111'));
  assert.doesNotMatch(lines.join('\n'), /9999|WAVG|COGS|GP/);
});

test('all sale money ends at the same column and large values are never truncated', () => {
  const lines = receiptLines(sale, 80);
  for (const label of ['Subtotal', 'Total discount', 'Original Total', 'Tendered', 'Paid Amount', 'Outstanding Balance', 'Change Given', 'CASH']) {
    assert.equal(row(lines, label).length, 48, label);
  }
  assert.equal(row(lines, 'Subtotal').endsWith('LKR 1,000.00'), true);
  assert.equal(row(lines, 'Original Total').endsWith('LKR 1,000.00'), true);
  assert.equal(row(lines, 'Change Given').endsWith('LKR 4,000.00'), true);
  const huge = { ...sale, details: [{ ...sale.details[0], quantity: '1234567', unitPrice: '1234567890.12', netTotal: '12345678901234.56' }], grandTotal: '12345678901234.56' };
  const hugeLines = receiptLines(huge, 80);
  assert.ok(hugeLines.every((line) => line.length <= 48));
  assert.ok(hugeLines.some((line) => line.endsWith('12,345,678,901,234.56')));
});

test('long SKU and item name wrap without corrupting the numeric row; 58 mm stays within 32 columns', () => {
  const long = { ...sale, details: [{ ...sale.details[0], product: { sku: 'SKU-EXTREMELY-LONG-000000000000000000000', productName: 'An exceptionally long margarin product description that must wrap cleanly without clipping the amount' } }] };
  for (const width of [58, 80]) {
    const lines = receiptLines(long, width);
    assert.ok(lines.every((line) => line.length <= RECEIPT_COLUMNS[width]));
    assert.ok(lines.some((line) => line.includes('S/N CODE')));
    assert.ok(lines.some((line) => line.includes('margarin')));
    assert.ok(lines.some((line) => /5\.000\s+200\.00\s+0\.00\s+1,000\.00$/.test(line)));
  }
  assert.equal(RECEIPT_COLUMNS[58], 32);
});

test('ESC/POS initializes state, centers the enlarged company, then resets style and returns body left', () => {
  const bytes = renderEscPos(sale, printer, true);
  assert.deepEqual(bytes.subarray(0, 22), Buffer.from([0x1b, 0x40, 0x1b, 0x21, 0, 0x1d, 0x21, 0, 0x1b, 0x4d, 0, 0x1b, 0x20, 0, 0x1b, 0x32, 0x1b, 0x61, 0, 0x1b, 0x74, 0]));
  const company = bytes.indexOf(Buffer.from('PRAMUD KUMARAGE'));
  const firstSeparator = bytes.indexOf(Buffer.from('-'.repeat(48)));
  const normal = bytes.indexOf(Buffer.from([0x1b, 0x21, 0, 0x1d, 0x21, 0, 0x1b, 0x4d, 0]), company);
  assert.ok(bytes.indexOf(Buffer.from([0x1b, 0x61, 1])) < company);
  assert.ok(bytes.indexOf(Buffer.from([0x1b, 0x21, 8, 0x1d, 0x21, 0x10])) < company);
  assert.ok(company < normal && normal < firstSeparator);
  const title = bytes.indexOf(Buffer.from('SALE RECEIPT - COPY'));
  const body = bytes.indexOf(Buffer.from('Bill No:'));
  assert.ok(bytes.indexOf(Buffer.from([0x1b, 0x61, 1]), firstSeparator) < title);
  assert.ok(bytes.indexOf(Buffer.from([0x1b, 0x61, 0]), title) < body);
  assert.equal(stripEscPos(bytes).trimEnd(), receiptLines(sale, 80, true).join('\n'));
});

test('split payment channels, references and long metadata remain readable', () => {
  const split = { ...sale, customer: { customerName: 'A customer with a long name that should wrap instead of overlapping Sale Type' },
    payments: [{ amount: '500', paymentMethod: { paymentMethodName: 'CASH' } }, { amount: '500', paymentMethod: { paymentMethodName: 'CARD' }, paymentChannel: { name: 'VISA' }, referenceNumber: 'APPROVED-123' }] };
  const lines = receiptLines(split, 80);
  assert.ok(lines.every((line) => line.length <= 48));
  assert.ok(lines.some((line) => line.includes('Customer: A customer with a long name')));
  assert.ok(lines.some((line) => line.includes('Payment: CASH + CARD / VISA')));
  assert.ok(lines.some((line) => line.includes('Reference: APPROVED-123')));
  assert.ok(lines.some((line) => line.startsWith('CARD / VISA') && line.endsWith('LKR 500.00')));
});

test('original and copy headings differ; refund shares layout and original-sale reference', () => {
  assert.ok(receiptLines(sale, 80).includes('SALE RECEIPT'));
  assert.ok(!receiptLines(sale, 80).includes('SALE RECEIPT - COPY'));
  const lines = receiptLines(refund, 80, true);
  assert.ok(lines.every((line) => line.length <= 48));
  assert.ok(lines.includes('REFUND RECEIPT - COPY'));
  assert.ok(lines.includes('Original sale'));
  assert.ok(lines.some((line) => line.includes('Refund No: 0002') && line.includes('Date:')));
  assert.ok(lines.some((line) => line.includes('Bill No: 0001') && line.includes('Date: 08/10/2026')));
  for (const label of ['Processed by: 001 / Administrator', 'S/N CODE  ITEM NAME', 'Subtotal', 'Total discount', 'Refund Total', 'Refund method', 'CARD / VISA', 'Reference: CARD-77', 'Reason: Customer return']) assert.ok(row(lines, label), label);
  assert.ok(lines.some((line) => line.startsWith('1. SKU-000013  Astra Margarin')));
  assert.ok(lines.some((line) => /1\.000\s+100\.00\s+5\.00\s+95\.00$/.test(line)));
  assert.equal(row(lines, 'Refund Total').length, 48);
  assert.ok(lines.includes('+94 71 776 8726 / +94 71 300 1389'));
  assert.doesNotMatch(lines.join('\n'), /9999|WAVG|COGS|GP/);
});

test('older snapshots use display-only serial fallback and no invented printed bill', () => {
  const old = { ...sale, billNo: null, header: { companyName: 'Bakery' }, details: [{ quantity: '1', unitPrice: '10', netTotal: '10', product: { productName: 'Old item' } }] };
  const lines = receiptLines(old, 58);
  assert.ok(lines.some((line) => line.includes('Bill No: Legacy')));
  assert.ok(lines.includes('1. Old item'));
  assert.ok(!lines.some((line) => line.startsWith('Cashier:')));
});

test('footer is printable before feed and final cut; cut-disabled emits no cut', () => {
  const bytes = renderEscPos(sale, printer);
  const footer = bytes.indexOf(Buffer.from('+94 71 776 8726 / +94 71 300 1389'));
  const feed = bytes.indexOf(Buffer.from([0x1b, 0x64, 0x06]));
  const cut = bytes.indexOf(Buffer.from([0x1d, 0x56, 0x00]));
  assert.ok(footer > 0 && footer < feed && feed < cut);
  assert.equal(cut, bytes.length - 3);
  assert.equal(renderEscPos(sale, { ...printer, cutEnabled: false }).indexOf(Buffer.from([0x1d, 0x56, 0x00])), -1);
  assert.ok(stripEscPos(bytes).trimEnd().endsWith('+94 71 776 8726 / +94 71 300 1389'));
});

test('TCP and Windows queue receive identical native ESC/POS bytes', async () => {
  const bytes = renderEscPos(sale, { ...printer, cutEnabled: false });
  const sent = [];
  const adapters = { TCP: async (_, data) => sent.push(data), WINDOWS_QUEUE: async (_, data) => sent.push(data) };
  await deliver({ transport: 'TCP' }, bytes, adapters);
  await deliver({ transport: 'WINDOWS_QUEUE' }, bytes, adapters);
  assert.deepEqual(sent, [bytes, bytes]);
});

test('development file transport still writes sale and refund bytes', async () => {
  for (const receipt of [sale, refund]) {
    const filePrinter = { ...printer, transport: 'FILE', target: join(process.cwd(), 'test-output'), documentType: receipt.documentType };
    const path = await deliver(filePrinter, renderEscPos(receipt, filePrinter));
    const output = stripEscPos(await readFile(path));
    assert.ok(output.includes(receipt.documentType === 'SALE' ? 'SALE RECEIPT' : 'REFUND RECEIPT'));
    assert.ok(output.includes('+94 71 776 8726 / +94 71 300 1389'));
  }
});
