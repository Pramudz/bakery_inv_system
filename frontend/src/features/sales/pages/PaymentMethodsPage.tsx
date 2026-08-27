import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PaymentMethod, paymentMethodsApi } from '../api/paymentMethodsApi';

export function PaymentMethodsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentMethod | null>(null);
  const [paymentMethodName, setPaymentMethodName] = useState('');
  const methods = useQuery({ queryKey: ['payment-methods'], queryFn: paymentMethodsApi.list });
  const close = () => { setOpen(false); setEditing(null); setPaymentMethodName(''); save.reset(); };
  const save = useMutation({
    mutationFn: () => editing
      ? paymentMethodsApi.update(editing.paymentMethodId, { paymentMethodName: paymentMethodName.trim() })
      : paymentMethodsApi.create({ paymentMethodName: paymentMethodName.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['payment-methods'] }); close(); },
  });
  const changeStatus = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => paymentMethodsApi.setActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] }),
  });
  const edit = (method: PaymentMethod) => { setEditing(method); setPaymentMethodName(method.paymentMethodName); setOpen(true); };
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };

  return <div>
    <div className="page-head"><div><div className="eyebrow">SALES / MASTER DATA</div><h1>Payment Methods</h1><p>Maintain payment methods for the current tenant.</p></div><button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add Payment Method</button></div>
    <div className="card"><table className="table">
      <thead><tr><th>ID</th><th>Tenant ID</th><th>Payment Method</th><th>Status</th><th className="right">Actions</th></tr></thead>
      <tbody>
        {methods.isLoading && <tr><td colSpan={5}>Loading...</td></tr>}
        {methods.isError && <tr><td colSpan={5}>Unable to load payment methods.</td></tr>}
        {(methods.data ?? []).map((method) => <tr key={method.paymentMethodId}>
          <td>{method.paymentMethodId}</td><td>{method.tenantId}</td><td><strong>{method.paymentMethodName}</strong></td>
          <td><span className={method.isActive ? 'status status-on' : 'status status-off'}><i /> {method.isActive ? 'Active' : 'Inactive'}</span></td>
          <td className="right actions"><div className="payment-method-actions"><button className="btn btn-edit-soft" onClick={() => edit(method)}>Edit</button><button className={method.isActive ? 'btn btn-danger-soft' : 'btn btn-success-soft'} disabled={changeStatus.isPending} onClick={() => changeStatus.mutate({ id: method.paymentMethodId, active: !method.isActive })}>{method.isActive ? 'Deactivate' : 'Activate'}</button></div></td>
        </tr>)}
      </tbody>
    </table></div>
    {open && <div className="modal-bg"><div className="modal"><form onSubmit={submit}>
      <div className="modal-head"><h2>{editing ? 'Edit' : 'Create'} Payment Method</h2></div>
      <div className="modal-body"><div className="form-grid">
        <div className="field"><label>Payment Method ID</label><input className="control" disabled placeholder="Auto-generated after save" value={editing?.paymentMethodId ?? ''} /></div>
        <div className="field"><label>Tenant ID</label><input className="control" disabled placeholder="Assigned from signed-in tenant" value={editing?.tenantId ?? ''} /></div>
        <div className="field full"><label>Payment Method<span className="required">*</span></label><input className="control" required maxLength={150} value={paymentMethodName} onChange={(event) => setPaymentMethodName(event.target.value)} placeholder="Enter payment method" /></div>
      </div>{save.isError && <div className="error-box">{(save.error as Error).message}</div>}</div>
      <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save'}</button></div>
    </form></div></div>}
  </div>;
}
