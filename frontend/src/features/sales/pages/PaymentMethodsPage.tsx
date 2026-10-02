import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PaymentMethod, paymentMethodsApi } from '../api/paymentMethodsApi';
import './sales-history.css';

export function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [paymentMethodName, setPaymentMethodName] = useState('');
  const [paymentMethodType, setPaymentMethodType] = useState<'CASH' | 'CARD' | 'CHEQUE'>('CASH');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: paymentMethodsApi.list });
  const rows = methods.data ?? [];
  const totalPages = Math.max(1, Math.ceil(rows.length / limit));
  const currentPage = Math.min(page, totalPages);
  const pagedRows = rows.slice((currentPage - 1) * limit, currentPage * limit);
  const visiblePages = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((number) => number >= 1 && number <= totalPages)
    .sort((a, b) => a - b);
  const close = () => { setOpen(false); setEditing(null); setPaymentMethodName(''); setPaymentMethodType('CASH'); save.reset(); };
  const save = useMutation({
    mutationFn: () => editing
      ? paymentMethodsApi.update(editing.paymentMethodId, { paymentMethodName: paymentMethodName.trim(), paymentMethodType })
      : paymentMethodsApi.create({ paymentMethodName: paymentMethodName.trim(), paymentMethodType }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payment-methods'] }); close(); },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => paymentMethodsApi.setActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }),
  });
  const edit = (method: PaymentMethod) => { setEditing(method); setPaymentMethodName(method.paymentMethodName); setPaymentMethodType(method.paymentMethodType ?? 'CASH'); setOpen(true); };
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };

  return <div>
    <div className="page-head"><div><div className="eyebrow">SALES / MASTER DATA</div><h1>Payment Methods</h1><p>Maintain payment methods for the current tenant.</p></div><button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add Payment Method</button></div>
    <div className="card"><table className="table">
      <thead><tr><th>ID</th><th>Tenant ID</th><th>Payment Method</th><th>Type</th><th>Status</th><th className="right">Actions</th></tr></thead>
      <tbody>
        {methods.isLoading && <tr><td colSpan={6}>Loading...</td></tr>}
        {methods.isError && <tr><td colSpan={6}>Unable to load payment methods.</td></tr>}
        {!methods.isLoading && !methods.isError && !rows.length && <tr><td colSpan={6}><div className="empty">No payment methods found.</div></td></tr>}
        {pagedRows.map((method) => <tr key={method.paymentMethodId}>
          <td>{method.paymentMethodId}</td><td>{method.tenantId}</td><td><strong>{method.paymentMethodName}</strong></td><td>{method.paymentMethodType ?? <span className="status status-off"><i /> Needs classification</span>}</td>
          <td><span className={method.isActive ? 'status status-on' : 'status status-off'}><i /> {method.isActive ? 'Active' : 'Inactive'}</span></td>
          <td className="right actions"><div className="payment-method-actions"><button className="btn btn-edit-soft" onClick={() => edit(method)}>Edit</button><button className={method.isActive ? 'btn btn-danger-soft' : 'btn btn-success-soft'} disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: method.paymentMethodId, active: !method.isActive })}>{method.isActive ? 'Deactivate' : 'Activate'}</button></div></td>
        </tr>)}
      </tbody>
    </table>
      <div className="toolbar sales-history-pagination">
        <span aria-live="polite">{methods.isLoading ? 'Loading payment methods...' : `Showing ${rows.length ? (currentPage - 1) * limit + 1 : 0}–${Math.min(currentPage * limit, rows.length)} of ${rows.length} payment methods`}</span>
        <nav className="sales-history-page-controls" aria-label="Payment methods pagination">
          <button className="btn btn-secondary" disabled={methods.isLoading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
          {visiblePages.map((number, index) => <span className="sales-history-page-number" key={number}>
            {index > 0 && number - visiblePages[index - 1] > 1 && <span aria-hidden="true">…</span>}
            <button className={number === currentPage ? 'btn btn-primary' : 'btn btn-secondary'} aria-label={`Page ${number}`} aria-current={number === currentPage ? 'page' : undefined} disabled={methods.isLoading} onClick={() => setPage(number)}>{number}</button>
          </span>)}
          <button className="btn btn-secondary" disabled={methods.isLoading || currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
          <select className="control" aria-label="Rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setPage(1); }}>
            <option value={20}>20</option><option value={50}>50</option><option value={100}>100</option>
          </select>
        </nav>
      </div>
    </div>
    {open && <div className="modal-bg"><div className="modal"><form onSubmit={submit}>
      <div className="modal-head"><h2>{editing ? 'Edit' : 'Create'} Payment Method</h2></div>
      <div className="modal-body"><div className="form-grid">
        <div className="field"><label>Payment Method ID</label><input className="control" disabled placeholder="Auto-generated after save" value={editing?.paymentMethodId ?? ''} /></div>
        <div className="field"><label>Tenant ID</label><input className="control" disabled placeholder="Assigned from signed-in tenant" value={editing?.tenantId ?? ''} /></div>
        <div className="field full"><label>Payment Method<span className="required">*</span></label><input className="control" required maxLength={150} value={paymentMethodName} onChange={(event) => setPaymentMethodName(event.target.value)} placeholder="Enter payment method" /></div>
        <div className="field full"><label>Enforced type<span className="required">*</span></label><select className="control" required value={paymentMethodType} onChange={(event) => setPaymentMethodType(event.target.value as 'CASH' | 'CARD' | 'CHEQUE')}><option value="CASH">Cash</option><option value="CARD">Credit / debit card</option><option value="CHEQUE">Cheque</option></select><small>The type cannot be changed after this method has transaction history.</small></div>
      </div>{save.isError && <div className="error-box">{(save.error as Error).message}</div>}</div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save'}</button></div>
    </form></div></div>}
  </div>;
}
