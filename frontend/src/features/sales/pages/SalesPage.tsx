import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { invoicesApi } from '../api/invoicesApi';
import { paymentMethodsApi } from '../api/paymentMethodsApi';
import { SalesBadge, SalesStat } from './SalesUi';
import { PaymentReceiptDialog, receiptNumber } from './PaymentReceipt';
import { PaymentReceipt, pendingPaymentsApi } from '../api/pendingPaymentsApi';
import { useAuth } from '../../auth/AuthContext';
import { InvoiceReceiptDialog } from './InvoiceReceiptDialog';
import { paymentChannelsApi } from '../api/paymentChannelsApi';
import './sales-history.css';

const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());
const originalPaymentMethods = (invoice: any) => {
  const payments = invoice.receiptSnapshot?.payments ?? (invoice.payments ?? []).filter((payment: any) => !payment.collectionKey);
  return [...new Set(payments.map((payment: any) => payment.paymentMethod?.paymentMethodName).filter(Boolean))].join(' + ') || 'No payment';
};

export function SalesPage() {
  const navigate = useNavigate();
  const { tenant, tenantUser, role, accessScope, assignedLocations, permissions } = useAuth();
  const queryScope = [tenant?.tenantId, tenantUser?.userId, role?.roleId, accessScope, assignedLocations.map((location) => location.locationId)];
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null);
  const [printInvoiceId, setPrintInvoiceId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [recordType, setRecordType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState<any | null>(null);
  const [correction, setCorrection] = useState({ reversalKey: crypto.randomUUID(), reason: '', replacementPaymentMethodId: '', replacementPaymentChannelId: '', replacementAmount: '', referenceNumber: '', cashPayout: false });
  const invoices = useQuery({ queryKey: ['invoices', ...queryScope], queryFn: invoicesApi.list });
  const payments = useQuery({ queryKey: ['payment-receipts', ...queryScope], queryFn: pendingPaymentsApi.history });
  const details = useQuery({ queryKey: ['invoice', selectedId, ...queryScope], queryFn: () => invoicesApi.get(selectedId!), enabled: selectedId !== null });
  const methods = useQuery({ queryKey: ['payment-methods', ...queryScope], queryFn: paymentMethodsApi.list });
  const channels = useQuery({ queryKey: ['payment-channels', 'active'], queryFn: () => paymentChannelsApi.list(true), enabled: Boolean(correcting) });
  const replacementMethod = (methods.data ?? []).find((method) => Number(method.paymentMethodId) === Number(correction.replacementPaymentMethodId));
  const reverse = useMutation({
    mutationFn: () => invoicesApi.reversePayment(selectedId!, correcting.invoicePaymentId, {
      reversalKey: correction.reversalKey,
      reason: correction.reason,
      replacementPaymentMethodId: correction.replacementPaymentMethodId ? Number(correction.replacementPaymentMethodId) : undefined,
      replacementPaymentChannelId: correction.replacementPaymentChannelId ? Number(correction.replacementPaymentChannelId) : undefined,
      replacementAmount: correction.replacementAmount ? Number(correction.replacementAmount) : undefined,
      referenceNumber: correction.referenceNumber || undefined,
      cashPayout: correction.cashPayout,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] }); queryClient.invalidateQueries({ queryKey: ['pending-payments'] }); queryClient.invalidateQueries({ queryKey: ['payment-receipts'] }); setCorrecting(null); setCorrection({ reversalKey: crypto.randomUUID(), reason: '', replacementPaymentMethodId: '', replacementPaymentChannelId: '', replacementAmount: '', referenceNumber: '', cashPayout: false }); },
  });
  const rows = useMemo(() => {
    const invoiceMap = new Map((invoices.data ?? []).map((invoice) => [String(invoice.invoiceId), invoice]));
    const records = [
      ...(invoices.data ?? []).map((invoice) => ({ key: `invoice-${invoice.invoiceId}`, type: 'INVOICE', date: invoice.invoiceDate, invoice, payment: null as PaymentReceipt | null })),
      ...(payments.data ?? []).map((payment) => ({ key: `payment-${payment.invoicePaymentId}`, type: 'PAYMENT', date: payment.paidAt, invoice: invoiceMap.get(String(payment.invoiceId)) ?? payment.invoice, payment })),
    ];
    return records.filter((record) => {
      const search = `${record.invoice.invoiceNumber} ${record.invoice.customer?.customerName ?? ''} ${record.payment ? receiptNumber(record.payment.invoicePaymentId) : ''} ${record.payment?.referenceNumber ?? ''}`.toLowerCase();
      return search.includes(query.trim().toLowerCase()) && (recordType === 'ALL' || record.type === recordType) && (status === 'ALL' || record.invoice.invoiceStatus === status);
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.key.localeCompare(a.key, undefined, { numeric: true }));
  }, [invoices.data, payments.data, query, status, recordType]);
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * limit, currentPage * limit);
  const loadingHistory = invoices.isLoading || payments.isLoading;
  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);
  const today = new Date().toDateString();
  const todayRows = (invoices.data ?? []).filter((x) => new Date(x.invoiceDate).toDateString() === today);
  const paid = (invoices.data ?? []).filter((x) => x.paymentStatus === 'PAID');
  const refunded = (invoices.data ?? []).filter((x) => x.invoiceStatus.includes('REFUNDED'));
  const creditSales = (invoices.data ?? []).filter((x) => x.isCreditSale);
  const outstanding = (invoices.data ?? []).reduce((sum, invoice) => sum + Number(invoice.balanceAmount), 0);
  const canCollect = role?.code === 'TENANT_ADMIN' || permissions.includes('SALES_PAYMENT_COLLECT');

  return <div>
    <div className="page-head"><div><div className="eyebrow">SALES</div><h1>Invoice History</h1><p>View invoices, item details, payments, refunds and payment corrections.</p></div></div>
    <div className="sales-stats"><SalesStat label="Today's Sales" value={`LKR ${money(todayRows.reduce((n, x) => n + Number(x.grandTotal), 0))}`} note={`${todayRows.length} original invoices`} tone="blue"/><SalesStat label="Paid Invoices" value={String(paid.length)} note="Fully paid" tone="green"/><SalesStat label="Credit Sales" value={String(creditSales.length)} note="Originally authorized on credit" tone="amber"/><SalesStat label="Outstanding" value={`LKR ${money(outstanding)}`} note="Current invoice balances" tone="red"/><SalesStat label="Refunded" value={String(refunded.length)} note="Partial or full" tone="red"/></div>
    <div className="card"><div className="sales-card-head"><div><h2>Invoices &amp; payments</h2><p>Original invoices and later payments, newest first. Sales totals count invoices only.</p></div></div><div className="sales-toolbar"><div className="sales-search"><span>⌕</span><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Invoice, receipt number or customer..." aria-label="Search sales history"/></div><select className="control sales-filter" aria-label="Record type" value={recordType} onChange={(event) => { setRecordType(event.target.value); setPage(1); }}><option value="ALL">All records</option><option value="INVOICE">Invoices only</option><option value="PAYMENT">Payments only</option></select><select className="control sales-filter" aria-label="Invoice status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="PARTIALLY_REFUNDED">Partially refunded</option><option value="FULLY_REFUNDED">Fully refunded</option></select></div>
      {(invoices.isError || payments.isError) && <div className="error-box" role="alert">{invoices.error?.message || payments.error?.message}<button className="btn btn-secondary" onClick={() => { void invoices.refetch(); void payments.refetch(); }}>Retry</button></div>}
      <div className="sales-table-wrap"><table className="table sales-history-table"><thead><tr><th>Record</th><th>Invoice / receipt</th><th>Date &amp; time</th><th>Customer</th><th>Payment Method</th><th>Payment Status</th><th>Status</th><th className="right">Amount</th><th className="right">Actions</th></tr></thead>
        <tbody>{invoices.isLoading || payments.isLoading ? <tr><td colSpan={9}>Loading history...</td></tr> : !rows.length ? <tr><td colSpan={9}>{invoices.isError || payments.isError ? 'History could not be loaded.' : 'No records match your filters.'}</td></tr> : pagedRows.map(({ key, invoice, payment, date }) => <tr key={key}>
          <td><strong>{payment ? 'Later collection' : invoice.isCreditSale ? 'Original credit sale' : 'Original sale'}</strong></td>
          <td>{payment ? <><strong className="sales-id">{receiptNumber(payment.invoicePaymentId)}</strong><small className="refund-code">{invoice.invoiceNumber}</small></> : <strong className="sales-id">{invoice.invoiceNumber}</strong>}</td>
          <td>{new Date(date).toLocaleString()}</td><td>{invoice.customer?.customerName ?? 'Walk-in Customer'}</td><td>{payment ? payment.paymentMethod.paymentMethodName : originalPaymentMethods(invoice)}</td>
          <td><SalesBadge status={payment ? payment.isReversed ? 'Reversed' : Number(payment.balanceAfter) === 0 ? 'Paid' : 'Partially Paid' : statusLabel(invoice.paymentStatus)} /></td>
          <td><SalesBadge status={payment ? payment.isReversed ? 'Reversed' : 'Received' : statusLabel(invoice.invoiceStatus)} /></td>
          <td className="right"><strong>LKR {money(payment ? payment.amount : invoice.grandTotal)}</strong></td>
          <td className="right"><div className="sales-history-actions">{payment ? <><button className="btn btn-edit-soft" onClick={() => setReceipt(payment)}>View / Print</button><button className="btn btn-secondary" onClick={() => { setSelectedId(Number(invoice.invoiceId)); setCorrecting(null); reverse.reset(); }}>View Invoice</button></> : <><button className="btn btn-edit-soft" onClick={() => setPrintInvoiceId(Number(invoice.invoiceId))}>View / Print</button>{invoice.invoiceStatus !== 'FULLY_REFUNDED' && <button className="btn btn-danger-soft" onClick={() => navigate(`/refunds?invoiceId=${invoice.invoiceId}`)}>Refund</button>}</>}</div></td>
        </tr>)}</tbody>
      </table></div>
      <div className="toolbar sales-history-pagination">
        <span aria-live="polite">{loadingHistory ? 'Loading history...' : `Showing ${rows.length ? (currentPage - 1) * limit + 1 : 0}–${Math.min(currentPage * limit, rows.length)} of ${rows.length} records`}</span>
        <nav className="sales-history-page-controls" aria-label="Invoice history pagination">
          <button className="btn btn-secondary" disabled={loadingHistory || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          {visiblePages.map((number, index) => <span className="sales-history-page-number" key={number}>
            {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}
            <button className={number === currentPage ? 'btn btn-primary' : 'btn btn-secondary'} aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} disabled={loadingHistory} onClick={() => setPage(number)}>{number}</button>
          </span>)}
          <button className="btn btn-secondary" disabled={loadingHistory || currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
          <select className="control" aria-label="Rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </nav>
      </div>
    </div>
    {selectedId !== null && <div className="modal-bg"><div className="modal invoice-detail-modal"><div className="modal-head"><div><h2>{details.data?.invoiceNumber ?? 'Invoice details'}</h2><p>{details.data ? `${details.data.customer?.customerName ?? 'Walk-in Customer'} · ${new Date(details.data.invoiceDate).toLocaleString()}` : 'Loading...'}</p></div><button className="icon-btn" onClick={() => setSelectedId(null)}>×</button></div>{details.data && <div className="modal-body">
      <div className="invoice-detail-summary"><div><span>Original total</span><strong>LKR {money(details.data.grandTotal)}</strong></div><div><span>Payments received</span><strong>LKR {money(details.data.paidAmount)}</strong></div><div><span>Outstanding balance</span><strong>LKR {money(details.data.balanceAmount)}</strong></div></div>
      {details.data.isCreditSale && <p><strong>Credit sale</strong> · authorized {details.data.creditAuthorizedAt ? new Date(details.data.creditAuthorizedAt).toLocaleString() : 'on the original sale'}{details.data.creditAuthorizedByUser?.username ? ` by ${details.data.creditAuthorizedByUser.username}` : ''}.</p>}
      <h3>Items</h3><table className="table"><thead><tr><th>Product</th><th>Qty</th><th className="right">Price</th><th className="right">Discount</th><th className="right">Net</th></tr></thead><tbody>{details.data.details.map((line: any) => <tr key={line.invoiceDetailId}><td><strong>{line.product.productName}</strong><small className="refund-code">{line.product.sku}</small></td><td>{Number(line.quantity)}</td><td className="right">{money(line.unitPrice)}</td><td className="right">{money(line.discountAmount)}</td><td className="right"><strong>{money(line.netTotal)}</strong></td></tr>)}</tbody></table>
      <h3>Payment History</h3>
      <p>Payments for this invoice, including amounts received later. Recorded balances show the balance at payment time.</p>
      <div className="sales-table-wrap"><table className="table"><thead><tr><th>Receipt / reference</th><th>Date</th><th>Method</th><th>Status</th><th className="right">Received</th><th className="right">Balance after</th><th className="right">Actions</th></tr></thead>
        <tbody>{!(details.data.payments ?? []).length ? <tr><td colSpan={7}>No payments received for this invoice yet.</td></tr> : [...details.data.payments].sort((a: any, b: any) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime() || Number(a.invoicePaymentId) - Number(b.invoicePaymentId)).map((payment: any) => {
          const hasReceipt = payment.collectionKey && payment.balanceBefore != null && payment.balanceAfter != null;
          return <tr key={payment.invoicePaymentId}>
            <td><strong>{hasReceipt ? receiptNumber(payment.invoicePaymentId) : 'Invoice payment'}</strong>{payment.referenceNumber && <small className="refund-code">{payment.referenceNumber}</small>}</td>
            <td>{new Date(payment.paidAt).toLocaleString()}</td><td>{payment.paymentMethod?.paymentMethodName ?? '?'}{payment.paymentChannel && <small className="refund-code">{payment.paymentChannelNameSnapshot ?? payment.paymentChannel.name}</small>}</td>
            <td><SalesBadge status={payment.isReversed ? 'Reversed' : 'Received'} /></td><td className="right">LKR {money(payment.amount)}</td>
            <td className="right">{hasReceipt ? `LKR ${money(payment.balanceAfter)}` : '?'}</td>
            <td className="right"><div className="sales-history-actions">{hasReceipt && <button className="btn btn-edit-soft" onClick={() => setReceipt({ ...payment, invoice: details.data })}>View / Print</button>}{!payment.isReversed && <button className="btn btn-edit-soft" onClick={() => { setCorrecting(payment); reverse.reset(); setCorrection({ reversalKey: crypto.randomUUID(), reason: '', replacementPaymentMethodId: String(payment.paymentMethodId), replacementPaymentChannelId: payment.paymentChannelId ? String(payment.paymentChannelId) : '', replacementAmount: String(payment.tenderedAmount), referenceNumber: payment.referenceNumber ?? '', cashPayout: false }); }}>Correct</button>}</div></td>
          </tr>;
        })}</tbody>
      </table></div>
      {correcting && <form className="payment-correction" onSubmit={(event: FormEvent) => { event.preventDefault(); reverse.mutate(); }}><h3>Correct payment</h3><div className="form-grid"><label className="field full"><span>Reason <b className="required">*</b></span><input className="control" required value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })}/></label><label className="field"><span>Correct method</span><select className="control" value={correction.replacementPaymentMethodId} onChange={(event) => setCorrection({ ...correction, replacementPaymentMethodId: event.target.value, replacementPaymentChannelId: '', referenceNumber: '' })}><option value="">Reverse only</option>{(methods.data ?? []).filter((x) => x.isActive && x.paymentMethodType).map((x) => <option key={x.paymentMethodId} value={x.paymentMethodId}>{x.paymentMethodName} — {x.paymentMethodType}</option>)}</select></label><label className="field"><span>Correct amount</span><input className="control" type="number" min="0.01" step="0.01" value={correction.replacementAmount} onChange={(event) => setCorrection({ ...correction, replacementAmount: event.target.value })}/></label>{replacementMethod?.paymentMethodType === 'CARD' && <><label className="field"><span>Card channel</span><select required className="control" value={correction.replacementPaymentChannelId} onChange={(event) => setCorrection({ ...correction, replacementPaymentChannelId: event.target.value })}><option value="">Choose acquiring bank</option>{(channels.data ?? []).map((channel) => <option key={channel.paymentChannelId} value={channel.paymentChannelId}>{channel.name}</option>)}</select></label><label className="field"><span>Approval / transaction reference</span><input required className="control" maxLength={100} value={correction.referenceNumber} onChange={(event) => setCorrection({ ...correction, referenceNumber: event.target.value })}/></label></>}{correcting.paymentMethodTypeSnapshot === 'CASH' && <label className="check full"><input type="checkbox" checked={correction.cashPayout} onChange={(event) => setCorrection({ ...correction, cashPayout: event.target.checked })}/> Cash physically leaves the current drawer (net tendered less change)</label>}</div>{reverse.isError && <div className="error-box">{(reverse.error as Error).message}</div>}<div className="payment-correction-actions"><button type="button" className="btn btn-secondary" onClick={() => setCorrecting(null)}>Cancel</button><button className="btn btn-primary" disabled={reverse.isPending}>{reverse.isPending ? 'Correcting...' : 'Reverse and replace'}</button></div></form>}
    </div>}<div className="modal-foot"><button className="btn btn-secondary" onClick={() => setSelectedId(null)}>Close</button>{canCollect && details.data?.customer && Number(details.data?.balanceAmount ?? 0) > 0 && <button className="btn btn-primary" onClick={() => navigate('/pending-payments')}>Collect Balance</button>}{details.data?.invoiceStatus !== 'FULLY_REFUNDED' && <button className="btn btn-danger-soft" onClick={() => navigate(`/refunds?invoiceId=${selectedId}`)}>Create Refund</button>}</div></div></div>}
    {receipt && <PaymentReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
    {printInvoiceId !== null && <InvoiceReceiptDialog invoiceId={printInvoiceId} onClose={() => setPrintInvoiceId(null)} onDetails={() => { setSelectedId(printInvoiceId); setPrintInvoiceId(null); setCorrecting(null); reverse.reset(); }} />}
  </div>;
}
