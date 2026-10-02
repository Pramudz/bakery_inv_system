import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PaymentChannel, paymentChannelsApi } from '../api/paymentChannelsApi';
import './sales-history.css';

export function CardChannelsPage() {
  const client = useQueryClient();
  const channels = useQuery({ queryKey: ['payment-channels'], queryFn: () => paymentChannelsApi.list() });
  const [editing, setEditing] = useState<PaymentChannel | null>(null);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const close = () => { setOpen(false); setEditing(null); setCode(''); setName(''); save.reset(); };
  const save = useMutation({
    mutationFn: () => {
      const data = { code: code.trim(), name: name.trim() };
      return editing ? paymentChannelsApi.update(editing.paymentChannelId, data) : paymentChannelsApi.create(data);
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['payment-channels'] }); close(); },
  });
  const status = useMutation({ mutationFn: ({ id, active }: { id: number; active: boolean }) => paymentChannelsApi.setActive(id, active), onSuccess: () => void client.invalidateQueries({ queryKey: ['payment-channels'] }) });
  const edit = (row: PaymentChannel) => { setEditing(row); setCode(row.code); setName(row.name); setOpen(true); };
  const submit = (event: FormEvent) => { event.preventDefault(); save.mutate(); };
  return <div>
    <div className="page-head"><div><div className="eyebrow">SALES / MASTER DATA</div><h1>Card Channels</h1><p>Configure tenant-wide acquiring-bank channels available at every sale location.</p></div><button className="btn btn-primary" onClick={() => setOpen(true)}>+ Add Card Channel</button></div>
    <div className="card"><table className="table"><thead><tr><th>Code</th><th>Channel</th><th>Status</th><th className="right">Actions</th></tr></thead><tbody>
      {channels.isLoading && <tr><td colSpan={4}>Loading...</td></tr>}
      {!channels.isLoading && !(channels.data ?? []).length && <tr><td colSpan={4}><div className="empty">No card channels configured. Add Commercial, Sampath, HSBC, or the actual tenant-wide acquiring channels.</div></td></tr>}
      {(channels.data ?? []).map((row) => <tr key={row.paymentChannelId}><td>{row.code}</td><td><strong>{row.name}</strong></td><td><span className={row.isActive ? 'status status-on' : 'status status-off'}><i />{row.isActive ? 'Active' : 'Inactive'}</span></td><td className="right actions"><button className="btn btn-edit-soft" onClick={() => edit(row)}>Edit</button> <button className={row.isActive ? 'btn btn-danger-soft' : 'btn btn-success-soft'} onClick={() => status.mutate({ id: row.paymentChannelId, active: !row.isActive })}>{row.isActive ? 'Deactivate' : 'Activate'}</button></td></tr>)}
    </tbody></table></div>
    {open && <div className="modal-bg"><div className="modal"><form onSubmit={submit}><div className="modal-head"><h2>{editing ? 'Edit' : 'Create'} Card Channel</h2></div><div className="modal-body"><div className="form-grid">
      <label className="field"><span>Code *</span><input className="control" required maxLength={50} value={code} onChange={(event) => setCode(event.target.value)} placeholder="COMMERCIAL" /></label>
      <label className="field"><span>Name *</span><input className="control" required maxLength={150} value={name} onChange={(event) => setName(event.target.value)} placeholder="Commercial" /></label>
    </div>{save.isError && <div className="error-box">{save.error.message}</div>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>{save.isPending ? 'Saving...' : 'Save'}</button></div></form></div></div>}
  </div>;
}
