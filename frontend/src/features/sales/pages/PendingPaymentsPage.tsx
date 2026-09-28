import { FormEvent, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../auth/AuthContext';
import { pendingPaymentsApi, PaymentReceipt, PendingInvoice, ReceivePaymentInput } from '../api/pendingPaymentsApi';
import { paymentMethodsApi } from '../api/paymentMethodsApi';
import { SalesBadge, SalesStat } from './SalesUi';
import './pending-payments.css';
import './sales-history.css';
import { PaymentReceiptContent, receiptNumber } from './PaymentReceipt';

const money = (value: string | number) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const customerName = (invoice: PendingInvoice) => invoice.customer?.customerName ?? 'Walk-in Customer';
const matches = (invoice: PendingInvoice, query: string) =>
  `${invoice.invoiceNumber} ${customerName(invoice)} ${invoice.customer?.phone ?? ''} ${invoice.customer?.mobile ?? ''}`.toLowerCase().includes(query.trim().toLowerCase());

export function PendingPaymentsPage() {
  const { tenant, tenantUser, role, accessScope, assignedLocations } = useAuth();
  const queryScope = [tenant?.tenantId, tenantUser?.userId, role?.roleId, accessScope, assignedLocations.map((location) => location.locationId)];
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [selected, setSelected] = useState<PendingInvoice | null>(null);
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [amount, setAmount] = useState('');
  const [methodId, setMethodId] = useState('');
  const [reference, setReference] = useState('');
  const [validation, setValidation] = useState('');
  const requestKey = useRef('');
  const submitting = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useQuery({ queryKey: ['pending-payments', ...queryScope], queryFn: pendingPaymentsApi.list });
  const history = useQuery({ queryKey: ['payment-receipts', ...queryScope], queryFn: pendingPaymentsApi.history });
  const methods = useQuery({ queryKey: ['payment-methods', ...queryScope], queryFn: paymentMethodsApi.list });
  const activeMethods = (methods.data ?? []).filter((method) => method.isActive);
  const open = selected !== null || receipt !== null;

  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);

  const refresh = () => {
    for (const key of ['pending-payments', 'payment-receipts', 'invoices', 'invoice']) {
      void client.invalidateQueries({ queryKey: [key] });
    }
  };
  const receive = useMutation({
    mutationFn: ({ invoice, data }: { invoice: PendingInvoice; data: ReceivePaymentInput }) => pendingPaymentsApi.receive(invoice.invoiceId, data),
    retry: false,
    onSuccess: (payment, { invoice, data }) => {
      setReceipt({ ...payment, invoice, paymentMethod: { paymentMethodName: activeMethods.find((method) => Number(method.paymentMethodId) === data.paymentMethodId)?.paymentMethodName ?? 'Payment' } });
      setSelected(null);
      refresh();
    },
    onError: refresh,
    onSettled: () => { submitting.current = false; },
  });

  const begin = (invoice: PendingInvoice) => {
    receive.reset();
    setValidation('');
    setSelected(invoice);
    setReceipt(null);
    setAmount(Number(invoice.balanceAmount).toFixed(2));
    setMethodId(activeMethods[0] ? String(activeMethods[0].paymentMethodId) : '');
    setReference('');
    requestKey.current = crypto.randomUUID();
  };
  const changed = () => {
    requestKey.current = crypto.randomUUID();
    setValidation('');
    receive.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || submitting.current) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || value > Number(selected.balanceAmount) || Math.round((value + Number.EPSILON) * 100) / 100 !== value) {
      setValidation('Enter an amount greater than zero, up to the remaining balance, with at most two decimal places.');
      return;
    }
    if (!activeMethods.some((method) => Number(method.paymentMethodId) === Number(methodId))) {
      setValidation('Choose an active payment method.');
      return;
    }
    submitting.current = true;
    receive.mutate({ invoice: selected, data: { amount: value, paymentMethodId: Number(methodId), referenceNumber: reference.trim() || undefined, collectionKey: requestKey.current } });
  };
  const close = () => {
    if (submitting.current) return;
    setSelected(null);
    setReceipt(null);
  };
  const invoices = pending.data ?? [];
  const rows = invoices.filter((invoice) => matches(invoice, query) && (status === 'ALL' || invoice.paymentStatus === status));
  const receipts = (history.data ?? []).filter((payment) => matches(payment.invoice, query) || receiptNumber(payment.invoicePaymentId).toLowerCase().includes(query.trim().toLowerCase()));
  const loadError = tab === 'pending' ? pending.error : history.error;
  const loading = tab === 'pending' ? pending.isPending : history.isPending;
  const total = tab === 'pending' ? rows.length : receipts.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * limit;
  const pagedInvoices = rows.slice(start, start + limit);
  const pagedReceipts = receipts.slice(start, start + limit);
  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);


  return <div className="pending-payments-page">
    <div className="page-head"><div><div className="eyebrow">SALES</div><h1>Pending Payments</h1><p>Receive outstanding invoice payments and print a payment receipt.</p></div><button className="btn btn-secondary" onClick={refresh}>Refresh</button></div>
    <div className="sales-stats">
      <SalesStat label="Outstanding balance" value={pending.isPending ? '—' : `LKR ${money(invoices.reduce((sum, invoice) => sum + Number(invoice.balanceAmount), 0))}`} note="Invoices awaiting payment" tone="amber" />
      <SalesStat label="Partially paid" value={String(invoices.filter((invoice) => invoice.paymentStatus === 'PARTIALLY_PAID').length)} note="Collect the remaining balance" tone="blue" />
      <SalesStat label="Unpaid" value={String(invoices.filter((invoice) => invoice.paymentStatus === 'UNPAID').length)} note="No payment received yet" tone="red" />
      <SalesStat label="Payment receipts" value={String((history.data ?? []).filter((payment) => !payment.isReversed).length)} note="Later payments recorded" tone="green" />
    </div>
    <div className="card">
      <div className="pending-tabs" role="group" aria-label="Payment view">
        <button className={tab === 'pending' ? 'active' : ''} aria-pressed={tab === 'pending'} onClick={() => { setTab('pending'); setPage(1); }}>Outstanding invoices</button>
        <button className={tab === 'history' ? 'active' : ''} aria-pressed={tab === 'history'} onClick={() => { setTab('history'); setPage(1); }}>Payment history</button>
      </div>
      <div className="sales-toolbar">
        <div className="sales-search"><input aria-label="Search payments" placeholder="Customer, phone or invoice number…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></div>
        {tab === 'pending' && <select className="control sales-filter" aria-label="Payment status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All pending payments</option><option value="PARTIALLY_PAID">Partially paid</option><option value="UNPAID">Unpaid</option></select>}
      </div>
      {loadError ? <div className="error-box" role="alert">{loadError.message} <button className="btn btn-secondary" onClick={refresh}>Retry</button></div> : tab === 'pending' ?
        <div className="sales-table-wrap"><table className="table"><thead><tr><th>Invoice / date</th><th>Customer</th><th>Location</th><th>Status</th><th className="right">Total</th><th className="right">Paid</th><th className="right">Balance due</th><th /></tr></thead>
          <tbody>{pending.isPending ? <tr><td colSpan={8}>Loading outstanding invoices…</td></tr> : !rows.length ? <tr><td colSpan={8} className="pending-empty">{query || status !== 'ALL' ? 'No invoices match your filters.' : 'No outstanding invoices. All completed bills are paid.'}</td></tr> : pagedInvoices.map((invoice) => <tr key={invoice.invoiceId}>
            <td><strong className="sales-id">{invoice.invoiceNumber}</strong><small className="refund-code">{new Date(invoice.invoiceDate).toLocaleDateString()}</small></td>
            <td><strong>{customerName(invoice)}</strong><small className="refund-code">{invoice.customer?.mobile || invoice.customer?.phone || 'No phone recorded'}</small></td><td>{invoice.location?.name}</td>
            <td><SalesBadge status={invoice.paymentStatus === 'UNPAID' ? 'Unpaid' : 'Partially Paid'} /></td><td className="right">{money(invoice.grandTotal)}</td><td className="right">{money(invoice.paidAmount)}</td><td className="right pending-balance">LKR {money(invoice.balanceAmount)}</td>
            <td className="right"><button className="btn btn-primary" onClick={() => begin(invoice)}>Receive Payment</button></td>
          </tr>)}</tbody></table></div> :
        <div className="sales-table-wrap"><table className="table"><thead><tr><th>Receipt / date</th><th>Invoice</th><th>Customer</th><th>Method</th><th className="right">Received</th><th>Status</th><th /></tr></thead>
          <tbody>{history.isPending ? <tr><td colSpan={7}>Loading payment history…</td></tr> : !receipts.length ? <tr><td colSpan={7} className="pending-empty">No payment receipts {query ? 'match your search' : 'recorded yet'}.</td></tr> : pagedReceipts.map((payment) => <tr key={payment.invoicePaymentId}>
            <td><strong className="sales-id">{receiptNumber(payment.invoicePaymentId)}</strong><small className="refund-code">{new Date(payment.paidAt).toLocaleString()}</small></td><td>{payment.invoice.invoiceNumber}</td><td>{customerName(payment.invoice)}</td><td>{payment.paymentMethod.paymentMethodName}</td><td className="right">LKR {money(payment.amount)}</td><td><SalesBadge status={payment.isReversed ? 'Reversed' : 'Received'} /></td><td className="right"><button className="btn btn-edit-soft" onClick={() => setReceipt(payment)}>View / Print</button></td>
          </tr>)}</tbody></table></div>}
      {!loadError && <>
      <div className="toolbar sales-history-pagination">
        <span aria-live="polite">{loading ? 'Loading payments...' : `Showing ${total ? (currentPage - 1) * limit + 1 : 0}–${Math.min(currentPage * limit, total)} of ${total} ${tab === 'pending' ? 'invoices' : 'receipts'}`}</span>
        <nav className="sales-history-page-controls" aria-label="Pending payments pagination">
          <button className="btn btn-secondary" disabled={loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          {visiblePages.map((number, index) => <span className="sales-history-page-number" key={number}>
            {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}
            <button className={number === currentPage ? 'btn btn-primary' : 'btn btn-secondary'} aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} disabled={loading} onClick={() => setPage(number)}>{number}</button>
          </span>)}
          <button className="btn btn-secondary" disabled={loading || currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
          <select className="control" aria-label="Rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </nav>
      </div>
      </>}
      <p className="pending-note">Amounts are in LKR. Invoices with returns are excluded; review them in Refunds before collecting further payment.</p>
    </div>
    {createPortal(<dialog ref={dialog} className="pending-dialog" aria-labelledby="pending-dialog-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="modal-head"><div><h2 id="pending-dialog-title">{receipt ? 'Payment Receipt' : 'Receive Payment'}</h2><p>{receipt ? receiptNumber(receipt.invoicePaymentId) : selected?.invoiceNumber}</p></div><button className="icon-btn" aria-label="Close" disabled={receive.isPending} onClick={close}>×</button></div>
      {selected && <form onSubmit={submit}>
        <div className="modal-body">
          <p><strong>{customerName(selected)}</strong> · {selected.location?.name}</p>
          <div className="pending-due"><span>Balance due</span><strong>LKR {money(selected.balanceAmount)}</strong></div>
          <fieldset disabled={receive.isPending} className="pending-fields">
            <label className="field"><span>Amount received (LKR)</span><input autoFocus required className="control" type="number" min="0.01" max={selected.balanceAmount} step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); changed(); }} /></label>
            <label className="field"><span>Payment method</span><select required className="control" value={methodId} onChange={(event) => { setMethodId(event.target.value); changed(); }}><option value="">Choose payment method</option>{activeMethods.map((method) => <option key={method.paymentMethodId} value={method.paymentMethodId}>{method.paymentMethodName}</option>)}</select></label>
            <label className="field"><span>Reference number (optional)</span><input className="control" maxLength={100} value={reference} onChange={(event) => { setReference(event.target.value); changed(); }} /></label>
          </fieldset>
          <p className="pending-after">Remaining after payment: <strong>LKR {money(Math.max(0, Number(selected.balanceAmount) - (Number(amount) || 0)))}</strong></p>
          {methods.isError && <div className="error-box" role="alert">{methods.error.message}</div>}
          {!methods.isPending && !methods.isError && !activeMethods.length && <div className="error-box">Add an active method in Payment Methods before receiving a payment.</div>}
          {(validation || receive.isError) && <div className="error-box" role="alert">{validation || receive.error?.message}</div>}
        </div><div className="modal-foot"><button className="btn btn-secondary" type="button" disabled={receive.isPending} onClick={close}>Cancel</button><button className="btn btn-primary" disabled={receive.isPending || methods.isPending || !activeMethods.length}>{receive.isPending ? 'Saving…' : 'Save & View Receipt'}</button></div>
      </form>}
      {receipt && <>
        <PaymentReceiptContent receipt={receipt} />
        <div className="modal-foot"><button className="btn btn-secondary" onClick={close}>Close</button><button className="btn btn-primary" onClick={() => window.print()}>Print Receipt</button></div>
      </>}
    </dialog>, document.body)}
  </div>;
}
