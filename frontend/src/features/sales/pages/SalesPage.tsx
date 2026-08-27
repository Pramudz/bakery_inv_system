import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { invoicesApi } from '../api/invoicesApi';
import { paymentMethodsApi } from '../api/paymentMethodsApi';
import { SalesBadge, SalesStat } from './SalesUi';

const money = (value: unknown) => Number(value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusLabel = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (x) => x.toUpperCase());

export function SalesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState<any | null>(null);
  const [correction, setCorrection] = useState({ reason: '', replacementPaymentMethodId: '', replacementAmount: '', referenceNumber: '' });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: invoicesApi.list });
  const details = useQuery({ queryKey: ['invoice', selectedId], queryFn: () => invoicesApi.get(selectedId!), enabled: selectedId !== null });
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: paymentMethodsApi.list });
  const reverse = useMutation({
    mutationFn: () => invoicesApi.reversePayment(selectedId!, correcting.invoicePaymentId, {
      reason: correction.reason,
      replacementPaymentMethodId: correction.replacementPaymentMethodId ? Number(correction.replacementPaymentMethodId) : undefined,
      replacementAmount: correction.replacementAmount ? Number(correction.replacementAmount) : undefined,
      referenceNumber: correction.referenceNumber || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['invoices'] }); queryClient.invalidateQueries({ queryKey: ['invoice', selectedId] }); setCorrecting(null); setCorrection({ reason: '', replacementPaymentMethodId: '', replacementAmount: '', referenceNumber: '' }); },
  });
  const rows = useMemo(() => (invoices.data ?? []).filter((invoice) => {
    const search = `${invoice.invoiceNumber} ${invoice.customer?.customerName ?? ''}`.toLowerCase();
    return search.includes(query.toLowerCase()) && (status === 'ALL' || invoice.invoiceStatus === status);
  }), [invoices.data, query, status]);
  const today = new Date().toDateString();
  const todayRows = (invoices.data ?? []).filter((x) => new Date(x.invoiceDate).toDateString() === today);
  const paid = (invoices.data ?? []).filter((x) => x.paymentStatus === 'PAID');
  const refunded = (invoices.data ?? []).filter((x) => x.invoiceStatus.includes('REFUNDED'));

  return <div>
    <div className="page-head"><div><div className="eyebrow">SALES</div><h1>Invoice History</h1><p>View invoices, item details, payments, refunds and payment corrections.</p></div></div>
    <div className="sales-stats"><SalesStat label="Today's Sales" value={`LKR ${money(todayRows.reduce((n, x) => n + Number(x.grandTotal), 0))}`} note={`${todayRows.length} invoices`} tone="blue"/><SalesStat label="Paid Invoices" value={String(paid.length)} note="Fully paid" tone="green"/><SalesStat label="All Invoices" value={String((invoices.data ?? []).length)} note="Recorded invoices" tone="amber"/><SalesStat label="Refunded" value={String(refunded.length)} note="Partial or full" tone="red"/></div>
    <div className="card"><div className="sales-card-head"><div><h2>All invoices</h2><p>Invoices recorded from every accessible billing location.</p></div></div><div className="sales-toolbar"><div className="sales-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice number or customer..."/></div><select className="control sales-filter" value={status} onChange={(event) => setStatus(event.target.value)}><option value="ALL">All statuses</option><option value="COMPLETED">Completed</option><option value="PARTIALLY_REFUNDED">Partially refunded</option><option value="FULLY_REFUNDED">Fully refunded</option></select></div>
      <div className="sales-table-wrap"><table className="table"><thead><tr><th>Invoice</th><th>Date & time</th><th>Customer</th><th>Location</th><th>Payment</th><th>Status</th><th className="right">Total</th><th className="right">Actions</th></tr></thead><tbody>{invoices.isLoading ? <tr><td colSpan={8}>Loading invoices...</td></tr> : rows.map((invoice) => <tr key={invoice.invoiceId}><td><strong className="sales-id">{invoice.invoiceNumber}</strong></td><td>{new Date(invoice.invoiceDate).toLocaleString()}</td><td>{invoice.customer?.customerName ?? 'Walk-in Customer'}</td><td>{invoice.location?.name ?? `#${invoice.locationId}`}</td><td><SalesBadge status={statusLabel(invoice.paymentStatus)}/></td><td><SalesBadge status={statusLabel(invoice.invoiceStatus)}/></td><td className="right"><strong>LKR {money(invoice.grandTotal)}</strong></td><td className="right actions"><button className="btn btn-edit-soft" onClick={() => setSelectedId(invoice.invoiceId)}>View</button>{invoice.invoiceStatus !== 'FULLY_REFUNDED' && <button className="btn btn-danger-soft" onClick={() => navigate(`/refunds?invoiceId=${invoice.invoiceId}`)}>Refund</button>}</td></tr>)}</tbody></table></div>
    </div>
    {selectedId !== null && <div className="modal-bg"><div className="modal invoice-detail-modal"><div className="modal-head"><div><h2>{details.data?.invoiceNumber ?? 'Invoice details'}</h2><p>{details.data ? `${details.data.customer?.customerName ?? 'Walk-in Customer'} · ${new Date(details.data.invoiceDate).toLocaleString()}` : 'Loading...'}</p></div><button className="icon-btn" onClick={() => setSelectedId(null)}>×</button></div>{details.data && <div className="modal-body">
      <div className="invoice-detail-summary"><div><span>Grand total</span><strong>LKR {money(details.data.grandTotal)}</strong></div><div><span>Paid</span><strong>LKR {money(details.data.paidAmount)}</strong></div><div><span>Balance</span><strong>LKR {money(details.data.balanceAmount)}</strong></div></div>
      <h3>Items</h3><table className="table"><thead><tr><th>Product</th><th>Qty</th><th className="right">Price</th><th className="right">Discount</th><th className="right">Net</th></tr></thead><tbody>{details.data.details.map((line: any) => <tr key={line.invoiceDetailId}><td><strong>{line.product.productName}</strong><small className="refund-code">{line.product.sku}</small></td><td>{Number(line.quantity)}</td><td className="right">{money(line.unitPrice)}</td><td className="right">{money(line.discountAmount)}</td><td className="right"><strong>{money(line.netTotal)}</strong></td></tr>)}</tbody></table>
      <h3>Payments</h3><table className="table"><thead><tr><th>Method</th><th>Date</th><th>Status</th><th className="right">Amount</th><th></th></tr></thead><tbody>{details.data.payments.map((payment: any) => <tr key={payment.invoicePaymentId}><td>{payment.paymentMethod.paymentMethodName}</td><td>{new Date(payment.paidAt).toLocaleString()}</td><td>{payment.isReversed ? <SalesBadge status="Reversed"/> : <SalesBadge status="Active"/>}</td><td className="right">LKR {money(payment.amount)}</td><td className="right">{!payment.isReversed && <button className="btn btn-edit-soft" onClick={() => { setCorrecting(payment); setCorrection({ reason: '', replacementPaymentMethodId: String(payment.paymentMethodId), replacementAmount: String(payment.tenderedAmount), referenceNumber: payment.referenceNumber ?? '' }); }}>Correct</button>}</td></tr>)}</tbody></table>
      {correcting && <form className="payment-correction" onSubmit={(event: FormEvent) => { event.preventDefault(); reverse.mutate(); }}><h3>Correct payment</h3><div className="form-grid"><label className="field full"><span>Reason <b className="required">*</b></span><input className="control" required value={correction.reason} onChange={(event) => setCorrection({ ...correction, reason: event.target.value })}/></label><label className="field"><span>Correct method</span><select className="control" value={correction.replacementPaymentMethodId} onChange={(event) => setCorrection({ ...correction, replacementPaymentMethodId: event.target.value })}><option value="">Reverse only</option>{(methods.data ?? []).filter((x) => x.isActive).map((x) => <option key={x.paymentMethodId} value={x.paymentMethodId}>{x.paymentMethodName}</option>)}</select></label><label className="field"><span>Correct amount</span><input className="control" type="number" min="0.01" step="0.01" value={correction.replacementAmount} onChange={(event) => setCorrection({ ...correction, replacementAmount: event.target.value })}/></label></div>{reverse.isError && <div className="error-box">{(reverse.error as Error).message}</div>}<div className="payment-correction-actions"><button type="button" className="btn btn-secondary" onClick={() => setCorrecting(null)}>Cancel</button><button className="btn btn-primary" disabled={reverse.isPending}>{reverse.isPending ? 'Correcting...' : 'Reverse and replace'}</button></div></form>}
    </div>}<div className="modal-foot"><button className="btn btn-secondary" onClick={() => setSelectedId(null)}>Close</button>{details.data?.invoiceStatus !== 'FULLY_REFUNDED' && <button className="btn btn-danger-soft" onClick={() => navigate(`/refunds?invoiceId=${selectedId}`)}>Create Refund</button>}</div></div></div>}
  </div>;
}
