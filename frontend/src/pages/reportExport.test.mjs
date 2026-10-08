import assert from 'node:assert/strict';
import test from 'node:test';
import { reportCsv, imagePagesPdf, downloadFile } from './reportExport.ts';
import { formatReportDate } from './reportData.ts';

test('CSV preserves Unicode, quotes, line breaks, numeric precision and blocks formulas', () => {
  assert.equal(reportCsv(['Name', 'Value'], [['පාන්, "cake"\nnew', 1234.567], ['=SUM(A1)', null], [-5, '@command']]), '\uFEFF"Name","Value"\r\n"පාන්, ""cake""\nnew","1234.567"\r\n"\'=SUM(A1)",""\r\n"-5","\'@command"');
});
test('CSV uses the same displayed business date as the report table', () => {
  assert.equal(reportCsv(['Date'], [[formatReportDate('2026-10-06')]]), '\uFEFF"Date"\r\n"06/10/2026"');
});
test('PDF creates multiple pages with accurate binary stream lengths and xref offsets', () => {
  const bytes = imagePagesPdf([new Uint8Array([255, 216, 255, 217]), new Uint8Array([255, 216, 0, 255, 217])], 1200, 850);
  const text = new TextDecoder('latin1').decode(bytes);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/Length 4/);
  assert.match(text, /\/Length 5/);
  const offset = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.equal(new TextDecoder().decode(bytes.slice(offset, offset + 4)), 'xref');
});
test('download clicks a named attachment and cleans up its object URL', () => {
  const calls = [];
  const anchor = { href: '', download: '', click() { calls.push(this.download); }, remove() { calls.push('removed'); } };
  const oldDocument = globalThis.document;
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  const oldTimeout = globalThis.setTimeout;
  globalThis.document = { createElement: () => anchor, body: { appendChild: () => {} } };
  URL.createObjectURL = () => 'blob:test';
  URL.revokeObjectURL = url => calls.push(url);
  globalThis.setTimeout = callback => { callback(); return 0; };
  try { downloadFile(new Blob(['csv']), 'report.csv'); assert.deepEqual(calls, ['report.csv', 'removed', 'blob:test']); }
  finally { globalThis.document = oldDocument; URL.createObjectURL = oldCreate; URL.revokeObjectURL = oldRevoke; globalThis.setTimeout = oldTimeout; }
});

test('PDF keeps every column and complete cell on one line with professional colors and vertical pagination', async () => {
  const { reportPdf } = await import('./reportExport.ts');
  const oldDocument = globalThis.document;
  const drawn = [];
  const colors = [];
  const context = {
    measureText: text => ({ width: [...text].length * 10 }),
    fillRect() { colors.push(this.fillStyle); },
    fillText(text, x, y) { drawn.push({ text, x, y }); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
  };
  const canvas = { getContext: () => context, toDataURL: () => 'data:image/jpeg;base64,/9j/2Q==' };
  globalThis.document = { fonts: { ready: Promise.resolve() }, createElement: () => canvas };
  try {
    const rows = Array.from({ length: 80 }, (_, i) => ['Product', String(i), ...Array.from({ length: 8 }, () => 'value')]);
    rows[0][2] = 'A long product description '.repeat(10);
    rows[0][3] = 'First line\nSecond line';
    rows[0][4] = formatReportDate('2026-10-06');
    const blob = await reportPdf({ title: 'Sales', metadata: ['Period: 2026-10-01 to 2026-10-05'], headers: ['Product', 'Row', ...Array.from({ length: 8 }, (_, i) => `Column ${i}`)], rows });
    assert.equal(blob.type, 'application/pdf');
    const pdf = await blob.text();
    assert.ok(Number(pdf.match(/\/Count (\d+)/)[1]) > 1);
    const firstRow = drawn.filter(item => [rows[0][2], 'First line Second line'].includes(item.text));
    assert.equal(firstRow.length, 2);
    assert.equal(firstRow[0].y, firstRow[1].y);
    const headings = drawn.filter(item => /^Column [0-7]$/.test(item.text));
    assert.equal(new Set(headings.slice(0, 8).map(item => item.y)).size, 1);
    assert.ok(drawn.some(item => item.text === '79'));
    assert.ok(drawn.some(item => item.text === '06/10/2026'));
    assert.ok(!drawn.some(item => item.text.startsWith('Columns ')));
    assert.ok(colors.includes('#172b4d'));
    assert.ok(colors.includes('#f5f7fa'));
    assert.ok(canvas.width > 1684);
    const pageWidth = Number(pdf.match(/\/MediaBox \[0 0 ([\d.]+)/)[1]);
    assert.ok(pageWidth > 841.89);
  } finally { globalThis.document = oldDocument; }
});
