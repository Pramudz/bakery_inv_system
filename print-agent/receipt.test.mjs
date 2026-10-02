import test from 'node:test';
import assert from 'node:assert/strict';
import { receiptLines, renderEscPos } from './receipt.mjs';
import { deliver } from './transports.mjs';

const sale = { documentType: 'SALE', businessDate: '2026-10-02', issuedAt: '2026-10-02T04:00:00.000Z', printedLocationCode: 'BANDA', printedRegisterCode: 'POS1', billNo: 1, header: { companyName: 'Bakery', locationAddress: ['Long address line near the main road'], cashierCode: 'C17', timeZone: 'Asia/Colombo' }, details: [{ quantity: '2', unitPrice: '100', netTotal: '200', discountAmount: '0', product: { productName: 'A very long pastry description with more words than fit on one line' } }], subtotal: '200', discountTotal: '0', grandTotal: '200', payments: [], tenderedAmount: '0', changeAmount: '0', balanceAmount: '200' };
test('58 mm sale output uses only visible reference fields and wraps lines', () => {
  const lines = receiptLines(sale, 58);
  assert.ok(lines.every((line) => line.length <= 32));
  assert.ok(lines.includes('Bill No: 0001'));
  assert.ok(lines.includes('Location: BANDA'));
  assert.ok(lines.includes('POS/Register: POS1'));
  assert.ok(!lines.some((line) => /invoice_id|UUID|INV-/.test(line)));
  assert.ok(renderEscPos(sale, { paperWidth: 58, encoding: 'CP437', cutEnabled: true }).includes(Buffer.from([0x1d, 0x56, 0x00])));
});
test('both physical transports accept the same bytes through fake adapters', async () => {
  const bytes = renderEscPos(sale, { paperWidth: 80, encoding: 'CP850', cutEnabled: false });
  const sent = [];
  const adapters = { TCP: async (_, data) => sent.push(data), WINDOWS_QUEUE: async (_, data) => sent.push(data) };
  await deliver({ transport: 'TCP' }, bytes, adapters);
  await deliver({ transport: 'WINDOWS_QUEUE' }, bytes, adapters);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1]);
});
test('refund receipt keeps its own number and the original printed sale fields', () => {
  const lines = receiptLines({ documentType: 'REFUND', header: sale.header, businessDate: '2026-10-03', refundNo: 2, printedLocationCode: 'BANDA', originalSale: { businessDate: '2026-10-02', locationCode: 'BANDA', registerCode: 'POS1', billNo: 1 }, details: [], refundTotal: '100', payments: [] }, 80, true);
  assert.ok(lines.includes('REFUND RECEIPT - COPY'));
  assert.ok(lines.includes('Refund No: 0002'));
  assert.ok(lines.includes('Bill No: 0001'));
});
