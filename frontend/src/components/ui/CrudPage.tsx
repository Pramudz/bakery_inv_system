import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Field={name:string;label:string;type?:string;required?:boolean;readOnly?:boolean;placeholder?:string;emptyValue?:unknown;options?:{label:string;value:string|number}[]|((rows:any[],editing:any|null)=>{label:string;value:string|number}[])};
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
  const idOf=(row:any)=>row.id??row.customerId??row.tenantId??row.userId??row.categoryId??row.brandId??row.supplierId??row.locationId??row.productId??row.productSupplierId??row.productUnitId??row.unitId??row.attributeId??row.identifierTypeId??row.priceListId??row.moduleId??row.permissionId??row.roleId;
  const start=(row:any)=>{setEditing(row);setForm({...row});setOpen(true)};
  const submit=(e:FormEvent)=>{e.preventDefault();const data=Object.fromEntries(fields.flatMap(f=>f.readOnly||form[f.name]===undefined?[]:form[f.name]===''&&f.emptyValue===undefined?[]:[[f.name,form[f.name]===''?f.emptyValue:form[f.name]]]));if(tenantId && !('tenantId' in data))data.tenantId=tenantId;mutation.mutate(data)};
  return <div>
    <div className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div><button className="btn btn-primary" onClick={()=>{setEditing(null);setForm({});setOpen(true)}}>＋ New {title.replace(/s$/,'').toLowerCase()}</button></div>
    <div className="card"><table className="table"><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}<th className="right">Actions</th></tr></thead><tbody>
      {q.isLoading?<tr><td colSpan={columns.length+1}>Loading...</td></tr>:q.error?<tr><td colSpan={columns.length+1}>Unable to load data</td></tr>:(q.data??[]).map((r:any)=><tr key={idOf(r)}>{columns.map(c=><td key={c.key}>{typeof r[c.key]==='boolean'?<span className={r[c.key]?'status status-on':'status status-off'}><i /> {r[c.key]?'Active':'Inactive'}</span>:String((c.key==='id'?idOf(r):r[c.key])??'—')}</td>)}<td className="right actions"><button className="btn btn-ghost" onClick={()=>start({...r,id:idOf(r)})}>Edit</button>{api.deactivate&&r.isActive!==false&&<button className="btn btn-danger-soft" onClick={()=>deactivate.mutate(idOf(r))} disabled={deactivate.isPending}>Deactivate</button>}</td></tr>)}</tbody></table></div>
    {open&&<div className="modal-bg"><div className="modal"><form onSubmit={submit}><div className="modal-head"><h2>{editing?'Edit':'Create'} {title.replace(/s$/,'')}</h2></div><div className="modal-body"><div className="form-grid">{fields.map(f=>{const options=typeof f.options==='function'?f.options(q.data??[],editing):f.options;return <div className="field" key={f.name}><label>{f.label}{f.required&&<span className="required">*</span>}</label>{options?<select className="control" required={f.required} disabled={f.readOnly} value={form[f.name]??''} onChange={e=>setForm({...form,[f.name]:e.target.value})}><option value="">Select...</option>{options.map(o=><option key={String(o.value)} value={o.value}>{o.label}</option>)}</select>:<input className="control" type={f.type??'text'} required={f.required} disabled={f.readOnly} placeholder={f.placeholder} value={form[f.name]??''} onChange={e=>setForm({...form,[f.name]:e.target.value})}/>}</div>})}</div>{mutation.isError&&<div className="error-box">{(mutation.error as Error).message}</div>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className="btn btn-primary" disabled={mutation.isPending}>{mutation.isPending?'Saving...':'Save'}</button></div></form></div></div>}
  </div>
}
