import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tenantsApi } from '../api/tenantsApi';
import { Modal } from '../../../components/ui/Modal';
import { Field } from '../../../components/ui/Field';

type Form={tenantCode:string;tenantName:string};
const idOf=(r:any)=>r.tenantId ?? r.id;
const nameOf=(r:any)=>r.tenantName ?? r.name ?? '';
const codeOf=(r:any)=>r.tenantCode ?? r.code ?? '';

export function TenantsPage(){
 const qc=useQueryClient(); const q=useQuery({queryKey:['tenants'],queryFn:tenantsApi.list});
 const [open,setOpen]=useState(false); const [editing,setEditing]=useState<any>(null); const [search,setSearch]=useState('');
 const [form,setForm]=useState<Form>({tenantCode:'',tenantName:''});
 const save=useMutation({mutationFn:(data:Form)=>editing?tenantsApi.update(idOf(editing),data):tenantsApi.create(data),onSuccess:()=>{qc.invalidateQueries({queryKey:['tenants']});setOpen(false);setEditing(null);},});
 const deactivate=useMutation({mutationFn:(id:number)=>tenantsApi.deactivate(id),onSuccess:()=>qc.invalidateQueries({queryKey:['tenants']})});
 const rows=useMemo(()=> (q.data??[]).filter(r=>`${codeOf(r)} ${nameOf(r)}`.toLowerCase().includes(search.toLowerCase())),[q.data,search]);
 const edit=(r:any)=>{setEditing(r);setForm({tenantCode:codeOf(r),tenantName:nameOf(r)});setOpen(true)};
 return <div>
   <div className="page-head"><div><div className="eyebrow">SYSTEM ADMINISTRATION</div><h1>Tenants</h1><p>Manage independent businesses and their ERP environments.</p></div><button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({tenantCode:'',tenantName:''});setOpen(true)}}>＋ New tenant</button></div>
   <div className="stats-row"><div className="stat-card"><span>Total tenants</span><strong>{q.data?.length ?? 0}</strong></div><div className="stat-card"><span>Active</span><strong>{(q.data??[]).filter(r=>r.tenantIsActive ?? r.isActive ?? true).length}</strong></div><div className="stat-card"><span>Inactive</span><strong>{(q.data??[]).filter(r=>(r.tenantIsActive ?? r.isActive)===false).length}</strong></div></div>
   <div className="card"><div className="toolbar"><div className="search-wrap"><span>⌕</span><input className="input search" placeholder="Search by tenant name or code..." value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="btn btn-secondary" onClick={()=>q.refetch()}>↻ Refresh</button></div>
    {q.isLoading?<div className="empty">Loading tenants...</div>:q.error?<div className="empty error-text">Unable to load tenants.</div>:rows.length===0?<div className="empty">No tenants found.</div>:<table className="table"><thead><tr><th>Tenant</th><th>Code</th><th>Status</th><th>Created</th><th className="right">Actions</th></tr></thead><tbody>{rows.map(r=>{const active=r.tenantIsActive ?? r.isActive ?? true; return <tr key={idOf(r)}><td><div className="primary-cell"><span className="avatar tenant-avatar">{nameOf(r).slice(0,1).toUpperCase()}</span><div><strong>{nameOf(r)}</strong><small>Tenant #{idOf(r)}</small></div></div></td><td><span className="code-chip">{codeOf(r)}</span></td><td><span className={active?'status status-on':'status status-off'}><i/> {active?'Active':'Inactive'}</span></td><td>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—'}</td><td className="right actions"><button className="btn btn-ghost" onClick={()=>edit(r)}>Edit</button>{active&&<button className="btn btn-danger-soft" onClick={()=>deactivate.mutate(idOf(r))}>Deactivate</button>}</td></tr>})}</tbody></table>}
   </div>
   <Modal open={open} onClose={()=>setOpen(false)} title={editing?'Edit tenant':'Create tenant'} subtitle="Tenant identity and lifecycle settings.">
     <form onSubmit={e=>{e.preventDefault();save.mutate(form)}}><div className="modal-body"><div className="form-grid"><Field label="Tenant code" value={form.tenantCode} onChange={v=>setForm({...form,tenantCode:v.toUpperCase()})} required placeholder="ABC-001" hint="Short unique code used by the platform."/><Field label="Tenant name" value={form.tenantName} onChange={v=>setForm({...form,tenantName:v})} required placeholder="ABC Supermarkets" full/></div>{save.error&&<div className="error-box">{(save.error as Error).message}</div>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-primary" disabled={save.isPending}>{save.isPending?'Saving...':editing?'Save changes':'Create tenant'}</button></div></form>
   </Modal>
 </div>
}
