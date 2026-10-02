import iconv from 'iconv-lite';

const safe = (value) => String(value ?? '').replace(/[\x00-\x1f\x7f]/g, ' ').trim();
const fmt = (value) => Number(value ?? 0).toFixed(2);
const date = (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '';

export function receiptLines(receipt, width, copy = false) {
  if (![58, 80].includes(width)) throw new Error('Paper width must be 58 or 80 mm.');
  const chars = width === 58 ? 32 : 48;
  const output = [];
  const wrap = (value) => {
    const words = safe(value).split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      if (line && line.length + word.length + 1 > chars) { output.push(line); line = ''; }
      if (word.length > chars) {
        if (line) { output.push(line); line = ''; }
        for (let i = 0; i < word.length; i += chars) output.push(word.slice(i, i + chars));
      } else line = line ? `${line} ${word}` : word;
    }
    if (line) output.push(line);
  };
  const field = (label, value) => wrap(`${label}: ${safe(value)}`);
  const divider = () => output.push('-'.repeat(chars));
  wrap(receipt.header?.companyName ?? 'POS RECEIPT');
  wrap(receipt.header?.locationName ?? '');
  for (const address of receipt.header?.locationAddress ?? []) wrap(address);
  if (receipt.header?.locationPhone) field('Tel', receipt.header.locationPhone);
  divider();
  wrap(`${receipt.documentType === 'REFUND' ? 'REFUND RECEIPT' : receipt.documentType === 'TEST' ? 'TEST PRINT' : 'SALE RECEIPT'}${copy ? ' - COPY' : ''}`);
  const localTime = receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: receipt.header?.timeZone ?? 'Asia/Colombo' }) : '';
  field('Date', `${date(receipt.businessDate)} ${localTime}`);
  if (receipt.printedLocationCode) field('Location', receipt.printedLocationCode);
  if (receipt.printedRegisterCode) field('POS/Register', receipt.printedRegisterCode);
  if (receipt.documentType === 'REFUND') field('Refund No', String(receipt.refundNo).padStart(4, '0'));
  else if (receipt.documentType === 'SALE') field('Bill No', String(receipt.billNo).padStart(4, '0'));
  if (receipt.header?.cashierCode) field(receipt.documentType === 'REFUND' ? 'Processed by' : 'Cashier', `${receipt.header.cashierCode} ${receipt.header.cashierName ?? ''}`);
  if (receipt.customer?.customerName) field('Customer', receipt.customer.customerName);
  if (receipt.documentType === 'REFUND') {
    divider(); wrap('Original sale');
    const sale = receipt.originalSale;
    if (sale) { field('Date', date(sale.businessDate)); field('Location', sale.locationCode); field('POS/Register', sale.registerCode); field('Bill No', String(sale.billNo).padStart(4, '0')); }
    else wrap('Legacy sale: no printed bill reference');
  }
  divider();
  for (const item of receipt.details ?? []) {
    wrap(item.product?.productName ?? 'Item');
    if (item.product?.sku) wrap(item.product.sku);
    field(`${item.quantity} x ${fmt(item.unitPrice)}`, receipt.documentType === 'REFUND' ? fmt(item.refundAmount) : fmt(item.netTotal));
    if (Number(item.discountAmount) > 0) field('Discount', fmt(item.discountAmount));
  }
  divider();
  if (receipt.documentType === 'REFUND') {
    field('Refund total LKR', fmt(receipt.refundTotal));
    for (const payment of receipt.payments ?? []) field(payment.paymentMethod?.paymentMethodName ?? 'Refund payment', fmt(payment.amount));
    if (receipt.reason) field('Reason', receipt.reason);
  } else if (receipt.documentType === 'SALE') {
    field('Subtotal LKR', fmt(receipt.subtotal));
    field('Discount LKR', fmt(receipt.discountTotal));
    field('Total LKR', fmt(receipt.grandTotal));
    for (const payment of receipt.payments ?? []) field(payment.paymentMethod?.paymentMethodName ?? 'Payment', fmt(payment.amount));
    field('Tendered LKR', fmt(receipt.tenderedAmount));
    if (Number(receipt.changeAmount) > 0) field('Change LKR', fmt(receipt.changeAmount));
    if (Number(receipt.balanceAmount) > 0) field('Outstanding LKR', fmt(receipt.balanceAmount));
  } else if (receipt.message) wrap(receipt.message);
  output.push('', '', '');
  return output;
}

export function renderEscPos(receipt, printer, copy = false) {
  const page = printer.encoding === 'UTF8' ? 0 : printer.encoding === 'CP850' ? 2 : 0;
  const encoding = printer.encoding === 'UTF8' ? 'utf8' : printer.encoding === 'CP850' ? 'cp850' : 'cp437';
  const lines = receiptLines(receipt, printer.paperWidth, copy).join('\n') + '\n';
  // Strip control characters from data before adding trusted ESC/POS commands.
  const content = iconv.encode(lines, encoding);
  return Buffer.concat([Buffer.from([0x1b, 0x40, 0x1b, 0x74, page]), content, ...(printer.cutEnabled ? [Buffer.from([0x1d, 0x56, 0x00])] : [])]);
}
