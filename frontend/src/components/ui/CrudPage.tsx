import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Field={name:string;label:string;type?:string;required?:boolean;options?:{label:string;value:string|number}[]};
type Props={
  title:string;subtitle:string;queryKey:string;api:{list:()=>Promise<any[]>;create:(x:any)=>Promise<any>;update?:(id:number,x:any)=>Promise<any>;deactivate?:(id:number)=>Promise<any>};
  columns:{key:string;label:string}[];fields:Field[];tenantId?:number|null;
};
export function CrudPage({title,subtitle,queryKey,api,columns,fields,tenantId}:Props){
  const qc=useQueryClient(); const [open,setOpen]=useState(false); const [editing,setEditing]=useState<any|null>(null);
  const [form,setForm]=useState<Record<string,any>>({});
  const q=useQuery({queryKey:[queryKey],queryFn:api.list});
  const mutation=useMutation({mutationFn:(x:any)=>editing&&api.update?api.update(editing.id,x):api.create(x),onSuccess:()=>{qc.invalidateQueries({queryKey:[queryKey]});setOpen(false);setEditing(null);}});
  const deactivate=useMutation({mutationFn:(id:number)=>api.deactivate!(id),onSuccess:()=>qc.invalidateQueries({queryKey:[queryKey]})});
  const start=(row:any)=>{setEditing(row);setForm({...row});setOpen(true)};
  const submit=(e:FormEvent)=>{e.preventDefault();const data={...form};if(tenantId && !('tenantId' in data))data.tenantId=tenantId;mutation.mutate(data)};
  return <div>
    <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({});setOpen(true)}}>+ New</button></div>
    <div className="card"><table className="table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}<th>Actions</th></tr></thead><tbody>
      {q.isLoading?<tr><td colSpan={columns.length+1}>Loading...</td></tr>:q.error?<tr><td colSpan={columns.length+1}>Unable to load data</td></tr>:(q.data??[]).map((r:any)=><tr key={r.id}>{columns.map(c=><td key={c.key}>{typeof r[c.key]==='boolean'?<span className={r[c.key]?'badge badge-on':'badge badge-off'}>{r[c.key]?'Active':'Inactive'}</span>:String((c.key==='id' ? (r.id ?? r.tenantId ?? r.userId ?? r.categoryId ?? r.supplierId ?? r.locationId ?? r.productId ?? r.productSupplierId ?? r.unitId) : r[c.key]) ?? '—')}</td>)}<td><button className="btn btn-secondary" onClick={()=>start({...r,id:(r.id ?? r.tenantId ?? r.userId ?? r.categoryId ?? r.supplierId ?? r.locationId ?? r.productId ?? r.unitId ?? r.productSupplierId)})}>Edit</button>{api.deactivate&&r.isActive!==false&&<button className="btn btn-danger" style={{marginLeft:6}} onClick={()=>deactivate.mutate(r.id)}>Deactivate</button>}</td></tr>)}</tbody></table></div>
    {open&&<div className="modal-bg"><div className="modal"><form onSubmit={submit}><div className="modal-head"><h2>{editing?'Edit':'Create'} {title.replace(/s$/,'')}</h2></div><div className="modal-body"><div className="form-grid">{fields.map(f=><div className="field" key={f.name}><label>{f.label}</label>{f.options?<select className="select" required={f.required} value={form[f.name]??''} onChange={e=>setForm({...form,[f.name]:e.target.value})}><option value="">Select...</option>{f.options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>:<input type={f.type??'text'} required={f.required} value={form[f.name]??''} onChange={e=>setForm({...form,[f.name]:e.target.value})}/>}</div>)}</div>{mutation.isError&&<div className="error">{(mutation.error as Error).message}</div>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending?'Saving...':'Save'}</button></div></form></div></div>}
  </div>
}
