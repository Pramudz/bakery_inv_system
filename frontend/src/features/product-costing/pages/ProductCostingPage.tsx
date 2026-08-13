import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productCostingApi } from '../api/product-costingApi';

export function ProductCostingPage(){
  const qc=useQueryClient();
  const q=useQuery({queryKey:['product-costing'],queryFn:productCostingApi.list});
  const [form,setForm]=useState<any>({currencyCode:'LKR',minimumQuantity:1});
  const m=useMutation({mutationFn:productCostingApi.create,onSuccess:()=>{qc.invalidateQueries({queryKey:['product-costing']});setForm({currencyCode:'LKR',minimumQuantity:1})}});
  const set=(k:string,v:any)=>setForm((x:any)=>({...x,[k]:v}));
  return <div>
    <div className="page-head"><div><h1>Product Supplier Costing</h1><p>Supplier purchase prices with effective dates and quantity tiers.</p></div></div>
    <div className="card" style={{padding:18,marginBottom:18}}>
      <h3>Add supplier cost</h3>
      <div className="form-grid">
        <div className="field"><label>Product Supplier ID</label><input type="number" value={form.productSupplierId??''} onChange={e=>set('productSupplierId',Number(e.target.value))}/></div>
        <div className="field"><label>Product Unit ID</label><input type="number" value={form.productUnitId??''} onChange={e=>set('productUnitId',Number(e.target.value))}/></div>
        <div className="field"><label>Purchase Price</label><input type="number" step="0.0001" value={form.purchasePrice??''} onChange={e=>set('purchasePrice',Number(e.target.value))}/></div>
        <div className="field"><label>Minimum Quantity</label><input type="number" value={form.minimumQuantity} onChange={e=>set('minimumQuantity',Number(e.target.value))}/></div>
        <div className="field"><label>Currency</label><input value={form.currencyCode} onChange={e=>set('currencyCode',e.target.value)}/></div>
        <div className="field"><label>Effective From</label><input type="datetime-local" value={form.effectiveFrom??''} onChange={e=>set('effectiveFrom',e.target.value)}/></div>
      </div>
      {m.isError&&<div className="error" style={{marginTop:12}}>{(m.error as Error).message}</div>}
      <button className="btn btn-primary" style={{marginTop:16}} onClick={()=>m.mutate(form)} disabled={m.isPending}>{m.isPending?'Saving...':'Add Cost'}</button>
    </div>
    <div className="card"><table className="table"><thead><tr><th>ID</th><th>Product Supplier</th><th>Unit</th><th>Price</th><th>Currency</th><th>Min Qty</th><th>Effective From</th></tr></thead><tbody>{q.isLoading?<tr><td colSpan={7}>Loading...</td></tr>:(q.data??[]).map((x:any)=><tr key={x.id}><td>{x.productSupplierPriceId}</td><td>{x.productSupplierId}</td><td>{x.productUnitId}</td><td>{x.purchasePrice}</td><td>{x.currencyCode}</td><td>{x.minimumQuantity}</td><td>{new Date(x.effectiveFrom).toLocaleString()}</td></tr>)}</tbody></table></div>
  </div>
}
