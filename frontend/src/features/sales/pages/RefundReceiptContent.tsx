import './invoice-receipt.css';

const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: unknown) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '';

export function RefundReceiptContent({ refund, copy = false }: { refund: Record<string, any>; copy?: boolean }) {
  const receipt = refund.receiptSnapshot;
  if (!receipt) return <div className="receipt-preview">Archived refund receipt unavailable.</div>;
  const time = receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: receipt.header?.timeZone ?? 'Asia/Colombo' }) : '';
  const field = (label: string, value: unknown) => <div><span>{label}</span><b>{String(value ?? '—')}</b></div>;
  const original = receipt.originalSale;
  return <div className="receipt-preview">
    <div className="receipt-business"><h3>{receipt.header?.companyName ?? 'Refund receipt'}</h3>{receipt.header?.locationName && <strong>{receipt.header.locationName}</strong>}{(receipt.header?.locationAddress ?? []).map((line: string, index: number) => <small key={index}>{line}</small>)}{receipt.header?.locationPhone && <small>Tel: {receipt.header.locationPhone}</small>}<h4>REFUND RECEIPT{copy ? ' - COPY' : ''}</h4></div>
    <div className="receipt-meta">{field('Refund No', receipt.refundNo == null ? 'Legacy' : String(receipt.refundNo).padStart(4, '0'))}{field('Date', `${date(receipt.businessDate)} ${time}`)}{field('Location', receipt.printedLocationCode)}{field('POS/Register', receipt.printedRegisterCode)}{field('Processed by', receipt.header?.cashierName ?? receipt.header?.cashierCode)}{field('Customer', receipt.customer?.customerName ?? 'Walk-in Customer')}</div>
    <div className="receipt-calculation"><strong>Original sale</strong>{original ? <>{field('Date', date(original.businessDate))}{field('Location', original.locationCode)}{field('POS/Register', original.registerCode)}{field('Bill No', String(original.billNo).padStart(4, '0'))}</> : <p>Legacy sale: printed bill reference unavailable.</p>}</div>
    <div className="receipt-two-line-head"><div className="receipt-identity-row"><span>S/N</span><span>Code / Item Name</span></div><div className="receipt-values-row"><span>Qty</span><span>Rate</span><span>Discount</span><span>Amount</span></div></div>
    {(receipt.details ?? []).map((line: any, index: number) => <div className="receipt-two-line-item" key={index}><div className="receipt-identity-row"><b>{line.lineNumber ?? index + 1}</b><strong>{line.product?.sku} · {line.product?.productName}</strong></div><div className="receipt-values-row"><b>{Number(line.quantity).toFixed(3)}</b><span>{money(line.unitPrice)}</span><span>{money(line.discountAmount)}</span><strong>{money(line.refundAmount)}</strong></div></div>)}
    <div className="receipt-calculation">{field('Subtotal', `LKR ${money(receipt.subtotal)}`)}{field('Total discount', `LKR ${money(receipt.discountTotal)}`)}<div className="receipt-total">{field('Refund Total', `LKR ${money(receipt.refundTotal)}`)}</div>{(receipt.payments ?? []).map((payment: any, index: number) => <div key={index}><span>{payment.paymentMethod?.paymentMethodName ?? 'Refund payment'}{payment.paymentChannel?.name ? ` / ${payment.paymentChannel.name}` : ''}</span><b>LKR {money(payment.amount)}</b>{payment.referenceNumber && <small>Ref: {payment.referenceNumber}</small>}</div>)}{field('Reason', receipt.reason)}</div>
    <div className="receipt-thanks"><strong>Thank you for shopping with us!</strong></div><div className="receipt-software">Software By: <b>Prosinc</b> · 07111111111</div>
  </div>;
}
