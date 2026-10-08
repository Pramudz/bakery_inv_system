import iconv from 'iconv-lite';

// Font A at normal scale gives 48 columns on the current 80 mm XP-80 path.
// The established 58 mm path uses 32. Enlarged header text has half the columns.
export const RECEIPT_COLUMNS = Object.freeze({ 58: 32, 80: 48 });

const safe = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
const money = (value) => Number(value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantity = (value) => Number(value ?? 0).toFixed(3);
const count = (value) => Number.isInteger(value) ? String(value) : Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
const date = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '';
const paymentSummary = (payments, empty) => [...new Set((payments ?? []).map((payment) => payment.paymentMethod?.paymentMethodName
  ? `${payment.paymentMethod.paymentMethodName}${payment.paymentChannel?.name ? ` / ${payment.paymentChannel.name}` : ''}` : null).filter(Boolean))].join(' + ') || empty;

function wrapText(value, width) {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let word of words) {
    while (word) {
      const space = line ? ' ' : '';
      const room = width - line.length - space.length;
      if (room <= 0) { lines.push(line); line = ''; continue; }
      if (word.length <= room) { line += space + word; break; }
      if (line) { lines.push(line); line = ''; continue; }
      lines.push(word.slice(0, room));
      word = word.slice(room);
    }
  }
  if (line) lines.push(line);
  return lines;
}

function wrapPrefixed(value, firstPrefix, continuation, width) {
  const words = safe(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = firstPrefix;
  let hasValue = false;
  for (let word of words) {
    while (word) {
      const space = hasValue ? ' ' : '';
      const room = width - line.length - space.length;
      if (room <= 0) { lines.push(line); line = continuation; hasValue = false; continue; }
      if (word.length <= room) { line += space + word; hasValue = true; break; }
      if (hasValue) { lines.push(line); line = continuation; hasValue = false; continue; }
      line += word.slice(0, room);
      lines.push(line);
      word = word.slice(room);
      line = continuation;
    }
  }
  if (hasValue || (!lines.length && firstPrefix.trim())) lines.push(line.trimEnd());
  return lines;
}

function layout(receipt, width, copy) {
  const columns = RECEIPT_COLUMNS[width];
  if (!columns) throw new Error('Paper width must be 58 or 80 mm.');
  const rows = [];
  const add = (text, options = {}) => rows.push({ text, align: options.align ?? 'left', bold: options.bold ?? false, wide: options.wide ?? false });
  const center = (value, options = {}) => wrapText(value, options.wide ? Math.floor(columns / 2) : columns).forEach((text) => add(text, { ...options, align: 'center' }));
  const separator = () => add('-'.repeat(columns));
  const field = (label, value) => {
    const prefix = `${label}: `;
    if (prefix.length >= columns) { wrapText(label, columns).forEach((text) => add(text)); wrapText(value, columns).forEach((text) => add(text)); }
    else wrapPrefixed(value, prefix, '  ', columns).forEach((text) => add(text));
  };
  const rightRow = (label, value, options = {}) => {
    const left = safe(label);
    const right = safe(value);
    if (left.length + right.length + 1 <= columns) add(left + ' '.repeat(columns - left.length - right.length) + right, options);
    else {
      wrapText(left, columns).forEach((text) => add(text, options));
      wrapText(right, columns).forEach((text) => add(text.padStart(columns), options));
    }
  };
  const amount = (label, value, options = {}) => rightRow(label, `LKR ${money(value)}`, options);
  const paired = (leftLabel, leftValue, rightLabel, rightValue) => {
    const left = `${leftLabel}: ${safe(leftValue)}`;
    const right = `${rightLabel}: ${safe(rightValue)}`;
    const half = Math.floor((columns - 2) / 2);
    if (left.length <= half && right.length <= columns - half - 2) add(left.padEnd(half) + '  ' + right);
    else { field(leftLabel, leftValue); field(rightLabel, rightValue); }
  };

  const header = receipt.header ?? {};
  center(header.companyName ?? 'POS RECEIPT', { bold: true, wide: true });
  center(header.locationName ?? '');
  for (const line of header.locationAddress ?? []) center(line);
  if (header.locationPhone) center(`Tel: ${header.locationPhone}`);
  separator();
  const title = receipt.documentType === 'REFUND' ? 'REFUND RECEIPT' : receipt.documentType === 'TEST' ? 'TEST PRINT' : 'SALE RECEIPT';
  center(`${title}${copy ? ' - COPY' : ''}`, { bold: true });
  separator();

  const issued = receipt.issuedAt ? new Date(receipt.issuedAt) : null;
  const localTime = issued && !Number.isNaN(issued.getTime()) ? issued.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: header.timeZone ?? 'Asia/Colombo' }) : '';
  const dateTime = [date(receipt.businessDate), localTime].filter(Boolean).join(' ');
  const number = receipt.documentType === 'REFUND' ? receipt.refundNo : receipt.billNo;
  const documentLabel = receipt.documentType === 'REFUND' ? 'Refund No' : 'Bill No';
  if (receipt.documentType !== 'TEST') {
    paired(documentLabel, number == null ? 'Legacy' : String(number).padStart(4, '0'), 'Date', dateTime);
    paired('Location', receipt.printedLocationCode ?? '-', 'POS/Register', receipt.printedRegisterCode ?? '-');
    const cashier = [header.cashierCode, header.cashierName].filter(Boolean).join(' / ');
    if (cashier) field(receipt.documentType === 'REFUND' ? 'Processed by' : 'Cashier', cashier);
    field('Customer', receipt.customer?.customerName ?? 'No customer selected');
  }
  if (receipt.documentType === 'SALE') {
    field('Sale Type', receipt.saleType === 'WHOLESALE' ? 'Wholesale' : 'Retail');
    field('Payment', paymentSummary(receipt.payments, 'Unpaid'));
  }
  if (receipt.documentType === 'REFUND') {
    separator();
    add('Original sale', { bold: true });
    const original = receipt.originalSale;
    if (original) {
      paired('Bill No', original.billNo == null ? 'Legacy' : String(original.billNo).padStart(4, '0'), 'Date', date(original.businessDate));
      paired('Location', original.locationCode ?? '-', 'POS/Register', original.registerCode ?? '-');
    } else add('Legacy sale: no printed bill reference');
  }

  if (receipt.documentType !== 'TEST') {
    separator();
    add('S/N CODE  ITEM NAME', { bold: true });
    const widths = [Math.floor(columns / 6), Math.floor(columns / 4), Math.floor(columns / 4)];
    widths.push(columns - widths.reduce((sum, value) => sum + value, 0));
    const numeric = (cells) => cells.every((cell, index) => cell.length <= widths[index])
      ? cells.map((cell, index) => cell.padStart(widths[index])).join('') : null;
    add(numeric(['QTY', 'RATE', 'DISCOUNT', 'AMOUNT']), { bold: true });
    separator();
    for (const [index, item] of (receipt.details ?? []).entries()) {
      const serial = Number.isSafeInteger(Number(item.lineNumber)) && Number(item.lineNumber) > 0 ? item.lineNumber : index + 1;
      const sku = safe(item.product?.sku);
      const prefix = `${serial}. ${sku ? `${sku}  ` : ''}`;
      if (prefix.length >= columns) { field('S/N', serial); field('Code', item.product?.sku ?? ''); wrapPrefixed(item.product?.productName ?? 'Item', '  ', '  ', columns).forEach((text) => add(text, { bold: true })); }
      else wrapPrefixed(item.product?.productName ?? 'Item', prefix, '    ', columns).forEach((text) => add(text, { bold: true }));
      const cells = [quantity(item.quantity), money(item.unitPrice), money(item.discountAmount), money(receipt.documentType === 'REFUND' ? item.refundAmount : item.netTotal)];
      const numericLine = numeric(cells);
      if (numericLine) add(numericLine);
      else { rightRow('Qty', cells[0]); rightRow('Rate', cells[1]); rightRow('Discount', cells[2]); rightRow('Amount', cells[3]); }
    }
    separator();
  }

  if (receipt.documentType === 'SALE') {
    const itemCount = (receipt.details ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    rightRow('Items count', count(itemCount));
    amount('Subtotal', receipt.subtotal);
    rightRow('Total discount', `- LKR ${money(receipt.discountTotal)}`);
    separator();
    amount('Original Total', receipt.grandTotal, { bold: true });
    separator();
    amount('Tendered', receipt.tenderedAmount);
    amount('Paid Amount', receipt.paidAmount);
    amount('Outstanding Balance', receipt.balanceAmount);
    amount('Change Given', receipt.changeAmount);
    rightRow('Payment method', paymentSummary(receipt.payments, 'Unpaid'));
    for (const payment of receipt.payments ?? []) {
      amount(`${payment.paymentMethod?.paymentMethodName ?? 'Payment'}${payment.paymentChannel?.name ? ` / ${payment.paymentChannel.name}` : ''}`, payment.amount);
      if (payment.referenceNumber) field('Reference', payment.referenceNumber);
    }
    const total = Number(receipt.grandTotal ?? 0);
    const paid = Number(receipt.paidAmount ?? 0);
    rightRow('Payment status', paid >= total && total > 0 ? 'FULL PAID' : paid > 0 ? 'PARTIALLY PAID' : 'NONE PAID');
  } else if (receipt.documentType === 'REFUND') {
    amount('Subtotal', receipt.subtotal);
    rightRow('Total discount', `- LKR ${money(receipt.discountTotal)}`);
    separator();
    amount('Refund Total', receipt.refundTotal, { bold: true });
    separator();
    rightRow('Refund method', paymentSummary(receipt.payments, 'Settle later'));
    for (const payment of receipt.payments ?? []) {
      amount(`${payment.paymentMethod?.paymentMethodName ?? 'Refund payment'}${payment.paymentChannel?.name ? ` / ${payment.paymentChannel.name}` : ''}`, payment.amount);
      if (payment.referenceNumber) field('Reference', payment.referenceNumber);
    }
    if (receipt.reason) field('Reason', receipt.reason);
  } else if (receipt.message) wrapText(receipt.message, columns).forEach((text) => add(text));

  separator();
  center('Thank you for shopping with us!', { bold: true });
  center('We appreciate your business and hope to see you again.');
  separator();
  center('Software by Prosinc :');
  center('+94 71 776 8726 / +94 71 300 1389');
  return rows;
}

export function receiptLines(receipt, width, copy = false) {
  return layout(receipt, width, copy).map((row) => row.text);
}

export function renderEscPos(receipt, printer, copy = false) {
  const page = printer.encoding === 'UTF8' ? 0 : printer.encoding === 'CP850' ? 2 : 0;
  const encoding = printer.encoding === 'UTF8' ? 'utf8' : printer.encoding === 'CP850' ? 'cp850' : 'cp437';
  // Reset printer, Font A, character size/spacing, line spacing, and alignment.
  const bytes = [Buffer.from([0x1b, 0x40, 0x1b, 0x21, 0x00, 0x1d, 0x21, 0x00, 0x1b, 0x4d, 0x00, 0x1b, 0x20, 0x00, 0x1b, 0x32, 0x1b, 0x61, 0x00, 0x1b, 0x74, page])];
  let align = 'left';
  let bold = false;
  let wide = false;
  for (const row of layout(receipt, printer.paperWidth, copy)) {
    if (row.align !== align) { align = row.align; bytes.push(Buffer.from([0x1b, 0x61, align === 'center' ? 1 : 0])); }
    if (row.bold !== bold || row.wide !== wide) {
      bold = row.bold; wide = row.wide;
      bytes.push(Buffer.from([0x1b, 0x21, bold ? 0x08 : 0x00, 0x1d, 0x21, wide ? 0x10 : 0x00, 0x1b, 0x4d, 0x00]));
    }
    bytes.push(iconv.encode(row.text + '\n', encoding));
  }
  // Keep the existing XP-80 full cut after the complete footer and feed.
  bytes.push(Buffer.from([0x1b, 0x64, 0x06]));
  if (printer.cutEnabled) bytes.push(Buffer.from([0x1d, 0x56, 0x00]));
  return Buffer.concat(bytes);
}
