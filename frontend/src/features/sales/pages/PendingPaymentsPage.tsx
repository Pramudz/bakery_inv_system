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
import { paymentChannelsApi } from '../api/paymentChannelsApi';
import { saleBillReference } from './saleBillReference';
import { ApiError } from '../../../services/apiClient';
import { clearRecoveryIntent, listRecoveryIntents, markRecoveryUncertain, newRecoveryIntent, saveRecoveryIntent, withRecoveryLock, type RecoveryIntent } from '../transactionRecoveryStorage';
import { posRegistersApi } from '../../pos-registers/api/posRegistersApi';
import { recoverySubmissionMessage } from '../transactionRecoveryError';

const money = (value: string | number) => Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const customerName = (invoice: PendingInvoice) => invoice.customer?.customerName ?? 'Historical anonymous sale';

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
  const [paymentChannelId, setPaymentChannelId] = useState('');
  const [validation, setValidation] = useState('');
  const submitting = useRef(false);
  const recovering = useRef(new Set<string>());
  const [unresolved, setUnresolved] = useState<RecoveryIntent<ReceivePaymentInput>[]>([]);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [storageError, setStorageError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const pending = useQuery({ queryKey: ['pending-payments', page, limit, query, status, ...queryScope], queryFn: () => pendingPaymentsApi.page(page, limit, query, status) });
  const history = useQuery({ queryKey: ['payment-receipts', page, limit, query, ...queryScope], queryFn: () => pendingPaymentsApi.historyPage(page, limit, query) });
  const methods = useQuery({ queryKey: ['payment-methods', ...queryScope], queryFn: paymentMethodsApi.list });
  const channels = useQuery({ queryKey: ['payment-channels', 'active'], queryFn: () => paymentChannelsApi.list(true) });
  const activeMethods = (methods.data ?? []).filter((method) => method.isActive && method.paymentMethodType);
  const selectedMethod = activeMethods.find((method) => Number(method.paymentMethodId) === Number(methodId));
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
  const reloadIntents = () => {
    if (!tenant?.tenantId || !tenantUser?.userId) return;
    try {
      setUnresolved(listRecoveryIntents<ReceivePaymentInput>(localStorage, 'collection', tenant.tenantId, tenantUser.userId));
      setStorageError('');
    } catch (error) { setStorageError((error as Error).message); }
  };
  const completeIntent = (intent: RecoveryIntent<ReceivePaymentInput>, payment: PaymentReceipt) => {
    if (Number(payment.invoiceId) !== intent.invoiceId || payment.collectionKey !== intent.key
      || Number(payment.tenderedAmount) !== intent.payload.amount
      || Number(payment.paymentMethodId) !== intent.payload.paymentMethodId
      || Number(payment.paymentChannelId ?? 0) !== Number(intent.payload.paymentChannelId ?? 0)
      || (intent.cashierSessionId !== null && Number(payment.posCashierSessionId) !== intent.cashierSessionId)
      || (intent.registerSessionId !== null && Number(payment.posRegisterSessionId) !== intent.registerSessionId)
      || (payment.referenceNumber ?? null) !== (intent.payload.referenceNumber?.trim() || null)) {
      setRecoveryMessage('The saved request does not match the server receipt. Ask an authorized manager to reconcile it.');
      return;
    }
    clearRecoveryIntent(localStorage, intent);
    reloadIntents();
    setReceipt(payment);
    setSelected(null);
    setRecoveryMessage('Completed transaction recovered. No new payment was posted.');
    refresh();
  };
  const recoverIntent = async (intent: RecoveryIntent<ReceivePaymentInput>, submittedError?: string) => {
    if (recovering.current.has(intent.key)) return;
    recovering.current.add(intent.key);
    try {
      const payment = await pendingPaymentsApi.outcome(intent.invoiceId, intent.key);
      completeIntent(intent, payment);
    } catch (error) {
      setRecoveryMessage(error instanceof ApiError && error.status === 404
        ? `${submittedError ? `${submittedError} ` : ''}The original request is not confirmed yet. Keep its UUID and retry the original request when ready.`
        : error instanceof ApiError && (error.status === 401 || error.status === 403)
          ? 'Sign in with collection permission to verify this request. Its original UUID is preserved.'
          : 'Transaction status is being verified. Please do not submit another payment until verification is complete.');
    } finally { recovering.current.delete(intent.key); }
  };
  useEffect(() => {
    if (!tenant?.tenantId || !tenantUser?.userId) return;
    try {
      const intents = listRecoveryIntents<ReceivePaymentInput>(localStorage, 'collection', tenant.tenantId, tenantUser.userId);
      setUnresolved(intents);
      setStorageError('');
      for (const intent of intents) void recoverIntent(intent);
    } catch (error) { setStorageError((error as Error).message); }
    const changed = () => reloadIntents();
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [tenant?.tenantId, tenantUser?.userId]);
  const receive = useMutation({
    mutationFn: async (intent: RecoveryIntent<ReceivePaymentInput>) => {
      await pendingPaymentsApi.receive(intent.invoiceId, intent.payload);
      return pendingPaymentsApi.outcome(intent.invoiceId, intent.key);
    },
    retry: false,
    onSuccess: (payment, intent) => completeIntent(intent, payment),
    onError: async (error, intent) => {
      try { markRecoveryUncertain(localStorage, intent); reloadIntents(); }
      catch (storageFailure) { setStorageError((storageFailure as Error).message); }
      const message = recoverySubmissionMessage(error, 'payment');
      setRecoveryMessage(message);
      await recoverIntent(intent, message);
    },
    onSettled: () => { submitting.current = false; },
  });

  const begin = (invoice: PendingInvoice) => {
    if (!(invoice.collectionEligible ?? Boolean(invoice.customer))) return;
    if (unresolved.length || storageError) { setRecoveryMessage('Recover the unresolved payment before starting another.'); return; }
    receive.reset();
    setValidation('');
    setSelected(invoice);
    setReceipt(null);
    setAmount(Number(invoice.balanceAmount).toFixed(2));
    setMethodId(activeMethods[0] ? String(activeMethods[0].paymentMethodId) : '');
    setReference('');
    setPaymentChannelId('');
  };
  const changed = () => {
    setValidation('');
    receive.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || submitting.current) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0 || Math.round((value + Number.EPSILON) * 100) / 100 !== value) {
      setValidation('Enter an amount greater than zero with at most two decimal places.');
      return;
    }
    if (!activeMethods.some((method) => Number(method.paymentMethodId) === Number(methodId))) {
      setValidation('Choose an active payment method.');
      return;
    }
    if (selectedMethod?.paymentMethodType !== 'CASH' && value > Number(selected.balanceAmount)) { setValidation('Only cash can be tendered above the remaining balance.'); return; }
    if (selectedMethod?.paymentMethodType === 'CARD' && !paymentChannelId) { setValidation('Select the card channel used for this payment.'); return; }
    if (selectedMethod?.paymentMethodType === 'CARD' && !reference.trim()) { setValidation('Enter the external card-machine approval or transaction reference.'); return; }
    if (!tenant?.tenantId || !tenantUser?.userId || unresolved.length || storageError) { setValidation('Recover the unresolved payment before submitting another.'); return; }
    submitting.current = true;
    void withRecoveryLock('collection', tenant.tenantId, tenantUser.userId, async () => {
      if (listRecoveryIntents<ReceivePaymentInput>(localStorage, 'collection', tenant.tenantId, tenantUser.userId).length) throw new Error('Recover the unresolved payment before submitting another.');
      const session = await posRegistersApi.sessionContext(Number(selected.location.locationId));
      const data: ReceivePaymentInput = { amount: value, paymentMethodId: Number(methodId), paymentChannelId: paymentChannelId ? Number(paymentChannelId) : undefined, referenceNumber: reference.trim() || undefined, collectionKey: crypto.randomUUID() };
      const intent = newRecoveryIntent('collection', tenant.tenantId, tenantUser.userId, selected.invoiceId, Number(selected.location.locationId), data, { registerSessionId: session.registerSession?.posRegisterSessionId, cashierSessionId: session.cashierSession?.posCashierSessionId });
      saveRecoveryIntent(localStorage, intent);
      reloadIntents();
      receive.mutate(intent);
    }).catch((error) => { submitting.current = false; setValidation((error as Error).message); reloadIntents(); });
  };
  const retryOriginal = (intent: RecoveryIntent<ReceivePaymentInput>) => {
    if (receive.isPending || submitting.current) return;
    try {
      const saved = listRecoveryIntents<ReceivePaymentInput>(localStorage, 'collection', intent.tenantId, intent.userId).find((row) => row.key === intent.key);
      if (!saved) throw new Error('The original request is unavailable. Reconcile payment history before proceeding.');
      submitting.current = true;
      receive.mutate(saved);
    } catch (error) { setRecoveryMessage((error as Error).message); }
  };
  const close = () => {
    if (submitting.current) return;
    setSelected(null);
    setReceipt(null);
  };
  const rows = pending.data?.items ?? [];
  const receipts = history.data?.items ?? [];
  const loadError = tab === 'pending' ? pending.error : history.error;
  const loading = tab === 'pending' ? pending.isPending : history.isPending;
  const total = tab === 'pending' ? pending.data?.total ?? 0 : history.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedInvoices = rows;
  const pagedReceipts = receipts;
  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);


  return <div className="pending-payments-page">
    <div className="page-head"><div><div className="eyebrow">SALES</div><h1>Pending Payments</h1><p>Receive outstanding invoice payments and print a payment receipt.</p></div><button className="btn btn-secondary" onClick={refresh}>Refresh</button></div>
    {storageError && <div className="error-box" role="alert">{storageError} No new collection can be submitted until its status is reconciled.</div>}
    {unresolved.map((intent) => <div className="error-box" role="status" key={intent.key}>
      <strong>Unresolved collection for invoice {intent.invoiceId}: LKR {money(intent.payload.amount)}</strong>
      <p>{recoveryMessage || 'Transaction status is being verified. Please do not submit another payment until verification is complete.'}</p>
      <button className="btn btn-secondary" disabled={receive.isPending} onClick={() => void recoverIntent(intent)}>Verify status</button>{' '}
      <button className="btn btn-primary" disabled={receive.isPending} onClick={() => retryOriginal(intent)}>Retry original request</button>
    </div>)}
    <div className="sales-stats">
      <SalesStat label="Outstanding balance" value={pending.isPending ? '—' : `LKR ${money(pending.data?.stats.outstanding ?? 0)}`} note="Invoices awaiting payment" tone="amber" />
      <SalesStat label="Partially paid" value={String(pending.data?.stats.partiallyPaid ?? 0)} note="Collect the remaining balance" tone="blue" />
      <SalesStat label="Unpaid" value={String(pending.data?.stats.unpaid ?? 0)} note="No payment received yet" tone="red" />
      <SalesStat label="Payment receipts" value={String(history.data?.stats.received ?? 0)} note="Later payments recorded" tone="green" />
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
            <td><strong className="sales-id">{saleBillReference(invoice)}</strong><small className="refund-code">{new Date(invoice.invoiceDate).toLocaleDateString()}</small></td>
            <td><strong>{customerName(invoice)}</strong><small className="refund-code">{invoice.customer?.mobile || invoice.customer?.phone || 'No phone recorded'}</small></td><td>{invoice.location?.name}</td>
            <td><SalesBadge status={invoice.paymentStatus === 'UNPAID' ? 'Unpaid' : 'Partially Paid'} /></td><td className="right">{money(invoice.grandTotal)}</td><td className="right">{money(invoice.paidAmount)}</td><td className="right pending-balance">LKR {money(invoice.balanceAmount)}</td>
            <td className="right"><button className="btn btn-primary" disabled={Boolean(unresolved.length || storageError) || !(invoice.collectionEligible ?? Boolean(invoice.customer))} title={!invoice.customer ? 'Historical anonymous balances are readable but cannot receive a customer collection.' : undefined} onClick={() => begin(invoice)}>{invoice.customer ? 'Receive Payment' : 'Read only'}</button></td>
          </tr>)}</tbody></table></div> :
        <div className="sales-table-wrap"><table className="table"><thead><tr><th>Receipt / date</th><th>Invoice</th><th>Customer</th><th>Method</th><th className="right">Received</th><th>Status</th><th /></tr></thead>
          <tbody>{history.isPending ? <tr><td colSpan={7}>Loading payment history…</td></tr> : !receipts.length ? <tr><td colSpan={7} className="pending-empty">No payment receipts {query ? 'match your search' : 'recorded yet'}.</td></tr> : pagedReceipts.map((payment) => <tr key={payment.invoicePaymentId}>
            <td><strong className="sales-id">{receiptNumber(payment.invoicePaymentId)}</strong><small className="refund-code">{new Date(payment.paidAt).toLocaleString()}</small></td><td>{saleBillReference(payment.invoice)}</td><td>{customerName(payment.invoice)}</td><td>{payment.paymentMethod.paymentMethodName}{payment.paymentChannel && <small className="refund-code">{payment.paymentChannel.name}</small>}</td><td className="right">LKR {money(payment.amount)}</td><td><SalesBadge status={payment.isReversed ? 'Reversed' : 'Received'} /></td><td className="right"><button className="btn btn-edit-soft" onClick={() => setReceipt(payment)}>View / Print</button></td>
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
      <p className="pending-note">Amounts are in LKR. Partially refunded invoices use their recalculated balance. Historical anonymous unpaid invoices remain visible but read-only.</p>
    </div>
    {createPortal(<dialog ref={dialog} className="pending-dialog" aria-labelledby="pending-dialog-title" onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="modal-head"><div><h2 id="pending-dialog-title">{receipt ? 'Payment Receipt' : 'Receive Payment'}</h2><p>{receipt ? receiptNumber(receipt.invoicePaymentId) : saleBillReference(selected)}</p></div><button className="icon-btn" aria-label="Close" disabled={receive.isPending} onClick={close}>×</button></div>
      {selected && <form onSubmit={submit}>
        <div className="modal-body">
          <p><strong>{customerName(selected)}</strong> · {selected.location?.name}</p>
          <div className="pending-due"><span>Balance due</span><strong>LKR {money(selected.balanceAmount)}</strong></div>
          <fieldset disabled={receive.isPending} className="pending-fields">
            <label className="field"><span>Amount tendered (LKR)</span><input autoFocus required className="control" type="number" min="0.01" step="0.01" value={amount} onChange={(event) => { setAmount(event.target.value); changed(); }} /></label>
            <label className="field"><span>Payment method</span><select required className="control" value={methodId} onChange={(event) => { setMethodId(event.target.value); setPaymentChannelId(''); changed(); }}><option value="">Choose payment method</option>{activeMethods.map((method) => <option key={method.paymentMethodId} value={method.paymentMethodId}>{method.paymentMethodName} — {method.paymentMethodType}</option>)}</select></label>
            {selectedMethod?.paymentMethodType === 'CARD' && <label className="field"><span>Card channel</span><select required className="control" value={paymentChannelId} onChange={(event) => { setPaymentChannelId(event.target.value); changed(); }}><option value="">Choose acquiring bank</option>{(channels.data ?? []).map((channel) => <option key={channel.paymentChannelId} value={channel.paymentChannelId}>{channel.name}</option>)}</select></label>}
            <label className="field"><span>{selectedMethod?.paymentMethodType === 'CARD' ? 'Approval / transaction reference' : 'Reference number (optional)'}</span><input className="control" required={selectedMethod?.paymentMethodType === 'CARD'} maxLength={100} value={reference} onChange={(event) => { setReference(event.target.value); changed(); }} /></label>
          </fieldset>
          <p className="pending-after">Remaining after payment: <strong>LKR {money(Math.max(0, Number(selected.balanceAmount) - (Number(amount) || 0)))}</strong></p>
          {selectedMethod?.paymentMethodType === 'CASH' && Number(amount) > Number(selected.balanceAmount) && <p className="pending-after">Change to give: <strong>LKR {money(Number(amount) - Number(selected.balanceAmount))}</strong></p>}
          {methods.isError && <div className="error-box" role="alert">{methods.error.message}</div>}
          {!methods.isPending && !methods.isError && !activeMethods.length && <div className="error-box">Add an active method in Payment Methods before receiving a payment.</div>}
          {selectedMethod?.paymentMethodType === 'CARD' && !channels.isPending && !(channels.data ?? []).length && <div className="error-box">No active card channel is configured for this tenant.</div>}
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
