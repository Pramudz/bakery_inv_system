import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { pendingPaymentsApi, type PaymentReceipt } from '../api/pendingPaymentsApi';
import { posPrintStatusApi } from '../api/posPrintStatusApi';
import { saleBillReference } from './saleBillReference';
import './pending-payments.css';

const money = (value: string | number | null | undefined) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const receiptNumber = (id: number) => `PAY-${String(id).padStart(6, '0')}`;

export function PaymentReceiptContent({ receipt }: { receipt: PaymentReceipt }) {
  const { tenant } = useAuth();
  const snapshot = receipt.receiptSnapshot;
  const invoice = receipt.invoice;
  const timeZone = snapshot?.header.timeZone || tenant?.timeZone || 'Asia/Colombo';
  const paidAt = snapshot?.issuedAt ?? receipt.paidAt;
  const date = Number.isNaN(new Date(paidAt).getTime()) ? 'Date unavailable' : new Date(paidAt).toLocaleString(undefined, { timeZone });
  const original = snapshot?.originalSale ? { ...snapshot.originalSale, printedLocationCode: snapshot.originalSale.locationCode, printedRegisterCode: snapshot.originalSale.registerCode } : invoice;
  const customer = snapshot?.customer;
  const customerName = customer?.customerName ?? invoice?.customer?.customerName ?? 'Walk-in Customer';
  const phone = customer?.phone ?? invoice?.customer?.mobile ?? invoice?.customer?.phone;
  const method = snapshot?.paymentMethod?.paymentMethodName ?? receipt.paymentMethod?.paymentMethodName ?? 'Payment';
  const channel = snapshot?.paymentChannel?.name ?? receipt.paymentChannel?.name;
  const before = snapshot?.balanceBefore ?? receipt.balanceBefore;
  const after = snapshot?.balanceAfter ?? receipt.balanceAfter;
  const reversed = receipt.isReversed;
  return <section className="pending-receipt" aria-label="Payment receipt">
    <header><h3>{snapshot?.header.companyName || tenant?.tenantName || 'Payment Receipt'}</h3><p>PAYMENT RECEIPT</p><strong>{snapshot?.paymentReceiptNumber ?? receiptNumber(receipt.invoicePaymentId)}</strong></header>
    {reversed && <div className="pending-reversed">REVERSED — this payment is no longer active</div>}
    <dl><div><dt>Date</dt><dd>{date}</dd></div><div><dt>Original sale</dt><dd>{saleBillReference(original)}</dd></div><div><dt>Customer</dt><dd>{customerName}</dd></div>{phone && <div><dt>Phone</dt><dd>{phone}</dd></div>}<div><dt>Location</dt><dd>{snapshot?.header.locationName || invoice?.location?.name || 'Location unavailable'}</dd></div><div><dt>Cashier</dt><dd>{snapshot?.header.cashierName || 'Cashier unavailable'}</dd></div><div><dt>Payment method</dt><dd>{method}{channel ? ` → ${channel}` : ''}</dd></div>{(snapshot?.referenceNumber ?? receipt.referenceNumber) && <div><dt>Approval / reference</dt><dd>{snapshot?.referenceNumber ?? receipt.referenceNumber}</dd></div>}</dl>
    <dl className="pending-receipt-totals"><div><dt>Original invoice total</dt><dd>{snapshot?.originalInvoiceTotal != null || invoice?.grandTotal != null ? `LKR ${money(snapshot?.originalInvoiceTotal ?? invoice?.grandTotal)}` : 'Unavailable'}</dd></div><div><dt>Previous balance</dt><dd>LKR {money(before)}</dd></div><div><dt>Tendered</dt><dd>LKR {money(snapshot?.tenderedAmount ?? receipt.tenderedAmount ?? receipt.amount)}</dd></div><div><dt>Paid amount</dt><dd>LKR {money(snapshot?.amount ?? receipt.amount)}</dd></div>{Number(snapshot?.changeAmount ?? receipt.changeAmount) > 0 && <div><dt>Change given</dt><dd>LKR {money(snapshot?.changeAmount ?? receipt.changeAmount)}</dd></div>}<div><dt>Outstanding balance</dt><dd>LKR {money(after)}</dd></div></dl>
    <p className="pending-receipt-status">{reversed ? 'REVERSED' : Number(after) === 0 ? 'FULLY PAID' : 'PARTIALLY PAID'}</p><footer>Balance shown is as recorded at the time of this payment.<br />Please keep this receipt with your original invoice.</footer>
  </section>;
}

export function PaymentReceiptPanel({ paymentId, onClose }: { paymentId: number; onClose: () => void }) {
  const client = useQueryClient();
  const receipt = useQuery({ queryKey: ['payment-receipt', paymentId], queryFn: () => pendingPaymentsApi.receipt(paymentId) });
  const status = useQuery({ queryKey: ['payment-print-status', paymentId], queryFn: () => posPrintStatusApi.get('PAYMENT_COLLECTION', paymentId), enabled: receipt.isSuccess, refetchInterval: (query) => query.state.data?.status === 'PENDING' || query.state.data?.status === 'CLAIMED' ? 2000 : false });
  const print = useMutation({ mutationFn: () => posPrintStatusApi.print('PAYMENT_COLLECTION', paymentId), onSuccess: () => void client.invalidateQueries({ queryKey: ['payment-print-status', paymentId] }) });
  const printState = status.data?.status;
  const busy = print.isPending || printState === 'PENDING' || printState === 'CLAIMED';
  return <>
    {receipt.isPending && <div className="modal-body" role="status">Loading payment receipt…</div>}
    {receipt.isError && <div className="modal-body error-box" role="alert">{receipt.error.message} <button className="btn btn-secondary" onClick={() => void receipt.refetch()}>Retry</button></div>}
    {receipt.data && <PaymentReceiptContent receipt={receipt.data} />}
    {status.isError && receipt.isSuccess && <div className="error-box" role="alert">Print status unavailable: {status.error.message} <button className="btn btn-secondary" onClick={() => void status.refetch()}>Retry</button></div>}
    {print.isError && <div className="error-box" role="alert">{print.error.message}</div>}
    {printState && printState !== 'NOT_REQUESTED' && <p className="pending-receipt-status" role="status">Print status: {printState === 'PENDING' ? 'Queued' : printState === 'CLAIMED' ? 'Printing' : printState === 'PRINTED' ? 'Printed / accepted by print transport' : 'Failed'}{status.data?.lastError ? ` — ${status.data.lastError}` : ''}</p>}
    <div className="modal-foot"><button className="btn btn-secondary" onClick={onClose}>Close</button>{receipt.data && <button className="btn btn-primary" disabled={busy || status.isPending} onClick={() => print.mutate()}>{busy ? 'Printing…' : printState === 'PRINTED' ? 'Reprint Receipt' : 'Print Receipt'}</button>}</div>
  </>;
}

export function PaymentReceiptDialog({ paymentId, onClose }: { paymentId: number; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return createPortal(<dialog ref={dialog} className="pending-dialog" aria-labelledby="sales-receipt-title" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <div className="modal-head"><div><h2 id="sales-receipt-title">Payment Receipt</h2><p>{receiptNumber(paymentId)}</p></div><button className="icon-btn" aria-label="Close receipt" onClick={onClose}>×</button></div>
    <PaymentReceiptPanel paymentId={paymentId} onClose={onClose} />
  </dialog>, document.body);
}
