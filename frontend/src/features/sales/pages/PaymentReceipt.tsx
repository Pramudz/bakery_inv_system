import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth/AuthContext';
import { PaymentReceipt } from '../api/pendingPaymentsApi';
import { saleBillReference } from './saleBillReference';
import './pending-payments.css';

const money = (value: string | number) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const receiptNumber = (id: number) => `PAY-${String(id).padStart(6, '0')}`;
const customerName = (invoice: PaymentReceipt['invoice']) => invoice.customer?.customerName ?? 'Walk-in Customer';

export function PaymentReceiptContent({ receipt }: { receipt: PaymentReceipt }) {
  const { tenant } = useAuth();
  return (<section className="pending-receipt" aria-label="Payment receipt">
          <header><h3>{tenant?.tenantName ?? 'Payment Receipt'}</h3><p>PAYMENT RECEIPT</p><strong>{receiptNumber(receipt.invoicePaymentId)}</strong></header>
          {receipt.isReversed && <div className="pending-reversed">REVERSED — this payment is no longer active</div>}
          <dl><div><dt>Date</dt><dd>{new Date(receipt.paidAt).toLocaleString()}</dd></div><div><dt>Original sale</dt><dd>{saleBillReference(receipt.invoice)}</dd></div><div><dt>Customer</dt><dd>{customerName(receipt.invoice)}</dd></div>{(receipt.invoice.customer?.mobile || receipt.invoice.customer?.phone) && <div><dt>Phone</dt><dd>{receipt.invoice.customer.mobile || receipt.invoice.customer.phone}</dd></div>}<div><dt>Location</dt><dd>{receipt.invoice.location?.name}</dd></div><div><dt>Payment method</dt><dd>{receipt.paymentMethod.paymentMethodName}{receipt.paymentChannel ? ` → ${receipt.paymentChannel.name}` : ''}</dd></div>{receipt.referenceNumber && <div><dt>Approval / reference</dt><dd>{receipt.referenceNumber}</dd></div>}</dl>
          <dl className="pending-receipt-totals"><div><dt>Original invoice total</dt><dd>LKR {money(receipt.invoice.grandTotal)}</dd></div><div><dt>Previous balance</dt><dd>LKR {money(receipt.balanceBefore)}</dd></div><div><dt>Tendered</dt><dd>LKR {money(receipt.tenderedAmount ?? receipt.amount)}</dd></div><div><dt>Paid amount</dt><dd>LKR {money(receipt.amount)}</dd></div>{Number(receipt.changeAmount) > 0 && <div><dt>Change given</dt><dd>LKR {money(receipt.changeAmount)}</dd></div>}<div><dt>Outstanding balance</dt><dd>LKR {money(receipt.balanceAfter)}</dd></div></dl>
          <p className="pending-receipt-status">{receipt.isReversed ? 'REVERSED' : Number(receipt.balanceAfter) === 0 ? 'FULLY PAID' : 'PARTIALLY PAID'}</p><footer>Balance shown is as recorded at the time of this payment.<br />Please keep this receipt with your original invoice.</footer>
        </section>);
}

export function PaymentReceiptDialog({ receipt, onClose }: { receipt: PaymentReceipt; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} className="pending-dialog" aria-labelledby="sales-receipt-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-head"><div><h2 id="sales-receipt-title">Payment Receipt</h2><p>{receiptNumber(receipt.invoicePaymentId)}</p></div><button className="icon-btn" aria-label="Close receipt" onClick={onClose}>?</button></div>
    <PaymentReceiptContent receipt={receipt} />
    <div className="modal-foot"><button className="btn btn-secondary" onClick={onClose}>Close</button><button className="btn btn-primary" onClick={() => window.print()}>Print Receipt</button></div>
  </dialog>, document.body);
}
