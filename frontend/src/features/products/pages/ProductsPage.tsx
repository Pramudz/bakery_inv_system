import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../api/productsApi';
import { categoriesApi } from '../../categories/api/categoriesApi';
import { brandsApi } from '../../brands/api/brandsApi';
import { unitsApi } from '../../units/api/unitsApi';
import { identifierTypesApi } from '../../identifier-types/api/identifier-typesApi';
import { productIdentifiersApi } from '../../product-identifiers/api/product-identifiersApi';
import { productUnitsApi } from '../../product-units/api/product-unitsApi';
import { priceListItemsApi } from '../../price-list-items/api/price-list-itemsApi';
import { priceListsApi } from '../../price-lists/api/price-listsApi';
import { locationsApi } from '../../locations/api/locationsApi';
import { productLocationsApi } from '../../product-locations/api/product-locationsApi';
import { Modal } from '../../../components/ui/Modal';
import { Field } from '../../../components/ui/Field';
import { Section } from '../../../components/ui/Section';

type ProductForm = {
  sku: string; productName: string; description: string; productType: string;
  categoryId: string; brandId: string; baseUnitId: string;
  isSellable: boolean; isPurchasable: boolean; isStockItem: boolean;
  trackBatch: boolean; trackExpiry: boolean; trackSerial: boolean;
};
type Identifier = { identifierTypeId: string; identifierValue: string; isPrimary: boolean };
type PUnit = { unitId: string; conversionFactor: string; isBaseUnit: boolean; isPurchaseUnit: boolean; isSalesUnit: boolean };
type Price = { priceListId: string; unitId: string; sellingPrice: string; minimumQuantity: string; effectiveFrom: string };
type Location = { locationId: string; isSellable: boolean; isPurchasable: boolean };

const id = (r: any, key: string) => r?.[key] ?? r?.id;
const emptyProduct = (): ProductForm => ({
  sku: '', productName: '', description: '', productType: 'STOCK',
  categoryId: '', brandId: '', baseUnitId: '', isSellable: true,
  isPurchasable: true, isStockItem: true, trackBatch: false,
  trackExpiry: false, trackSerial: false,
});

export function ProductsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProductForm>(emptyProduct());
  const [identifiers, setIdentifiers] = useState<Identifier[]>([]);
  const [productUnits, setProductUnits] = useState<PUnit[]>([]);
  const [prices, setPrices] = useState<Price[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const products = useQuery({ queryKey: ['products'], queryFn: productsApi.list });
  const categories = useQuery({ queryKey: ['categories'], queryFn: categoriesApi.list });
  const brands = useQuery({ queryKey: ['brands'], queryFn: brandsApi.list });
  const units = useQuery({ queryKey: ['units'], queryFn: unitsApi.list });
  const identifierTypes = useQuery({ queryKey: ['identifier-types'], queryFn: identifierTypesApi.list });
  const priceLists = useQuery({ queryKey: ['price-lists'], queryFn: priceListsApi.list });
  const locationsQ = useQuery({ queryKey: ['locations'], queryFn: locationsApi.list });

  const rows = useMemo(
    () => (products.data ?? []).filter((r: any) => `${r.sku ?? ''} ${r.productName ?? ''}`.toLowerCase().includes(search.toLowerCase())),
    [products.data, search],
  );

  const categoryOptions = (categories.data ?? []).filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, 'categoryId'), label: r.categoryName ?? r.name }));
  const brandOptions = (brands.data ?? []).filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, 'brandId'), label: r.brandName ?? r.name }));
  const unitOptions = (units.data ?? []).filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, 'unitId'), label: `${r.name ?? r.unitName} (${r.symbol ?? r.code ?? ''})` }));
  const identifierTypeOptions = (identifierTypes.data ?? []).filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, 'identifierTypeId'), label: r.name ?? r.code }));
  const priceListOptions = (priceLists.data ?? []).filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, 'priceListId'), label: r.name ?? r.code }));
  const locationOptions = (locationsQ.data ?? []).filter((r: any) => r.isActive !== false)
    .map((r: any) => ({ value: id(r, 'locationId'), label: r.name ?? r.code }));

  const reset = () => {
    setForm(emptyProduct()); setIdentifiers([]); setProductUnits([]); setPrices([]); setLocations([]);
    setStep(0); setError(''); setOpen(true);
  };

  const addIdentifier = () => setIdentifiers([...identifiers, { identifierTypeId: '', identifierValue: '', isPrimary: identifiers.length === 0 }]);
  const addUnit = () => setProductUnits([...productUnits, { unitId: '', conversionFactor: '1', isBaseUnit: false, isPurchaseUnit: false, isSalesUnit: true }]);
  const addPrice = () => setPrices([...prices, { priceListId: '', unitId: '', sellingPrice: '', minimumQuantity: '1', effectiveFrom: new Date().toISOString().slice(0, 16) }]);
  const addLocation = () => setLocations([...locations, { locationId: '', isSellable: true, isPurchasable: true }]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const product: any = await productsApi.create({
        ...form,
        categoryId: Number(form.categoryId),
        brandId: form.brandId ? Number(form.brandId) : undefined,
        baseUnitId: Number(form.baseUnitId),
      });
      const productId = id(product, 'productId');
      for (const x of identifiers) {
        await productIdentifiersApi.create({ productId, identifierTypeId: Number(x.identifierTypeId), identifierValue: x.identifierValue, isPrimary: x.isPrimary });
      }
      for (const x of productUnits) {
        await productUnitsApi.create({ productId, unitId: Number(x.unitId), conversionFactor: Number(x.conversionFactor), isBaseUnit: x.isBaseUnit, isPurchaseUnit: x.isPurchaseUnit, isSalesUnit: x.isSalesUnit });
      }
      for (const x of prices) {
        await priceListItemsApi.create({ priceListId: Number(x.priceListId), productId, unitId: Number(x.unitId), sellingPrice: Number(x.sellingPrice), minimumQuantity: Number(x.minimumQuantity || 1), effectiveFrom: x.effectiveFrom });
      }
      for (const x of locations) {
        await productLocationsApi.create({ productId, locationId: Number(x.locationId), isSellable: x.isSellable, isPurchasable: x.isPurchasable });
      }
      await qc.invalidateQueries({ queryKey: ['products'] });
      setOpen(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const steps = ['General', 'Identifiers', 'Units', 'Pricing', 'Locations'];

  return <div>
    <div className="page-head">
      <div><div className="eyebrow">PRODUCT MASTER</div><h1>Products</h1><p>Manage products with identifiers, packaging, pricing and location setup.</p></div>
      <button className="btn btn-primary" onClick={reset}>＋ Create product</button>
    </div>

    <div className="card">
      <div className="toolbar"><div className="search-wrap"><span>⌕</span><input className="input search" placeholder="Search SKU or product name..." value={search} onChange={e => setSearch(e.target.value)} /></div><button className="btn btn-secondary" onClick={() => products.refetch()}>↻ Refresh</button></div>
      <table className="table"><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Base unit</th><th>Status</th><th className="right">Actions</th></tr></thead>
        <tbody>{products.isLoading ? <tr><td colSpan={6}>Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={6}><div className="empty">No products found.</div></td></tr> : rows.map((r: any) => <tr key={id(r, 'productId')}>
          <td><div className="primary-cell"><span className="product-dot">P</span><div><strong>{r.productName}</strong><small>{r.description ?? 'Product master'}</small></div></div></td>
          <td><span className="code-chip">{r.sku}</span></td>
          <td>{r.category?.categoryName ?? r.category?.name ?? r.categoryName ?? r.categoryId ?? '—'}</td>
          <td>{r.baseUnit?.name ?? r.baseUnit?.code ?? r.baseUnitId ?? '—'}</td>
          <td><span className={r.isActive !== false ? 'status status-on' : 'status status-off'}><i /> {r.isActive !== false ? 'Active' : 'Inactive'}</span></td>
          <td className="right"><button className="btn btn-ghost">View</button></td>
        </tr>)}</tbody>
      </table>
    </div>

    <Modal open={open} onClose={() => !busy && setOpen(false)} title="Create product" subtitle="Set up the product master and its related commercial configuration." wide>
      <div className="wizard-tabs">{steps.map((s, i) => <button key={s} className={step === i ? 'wizard-tab active' : 'wizard-tab'} onClick={() => setStep(i)} type="button"><span>{i + 1}</span>{s}</button>)}</div>
      <div className="modal-body product-body">
        {step === 0 && <>
          <Section title="Basic information" description="The core identity used across purchasing, inventory and POS.">
            <div className="form-grid">
              <Field label="SKU" value={form.sku} onChange={v => setForm({ ...form, sku: v })} required placeholder="COC-500" />
              <Field label="Product name" value={form.productName} onChange={v => setForm({ ...form, productName: v })} required placeholder="Coca-Cola 500ml" />
              <Field label="Category" value={form.categoryId} onChange={v => setForm({ ...form, categoryId: v })} options={categoryOptions} required />
              <Field label="Brand" value={form.brandId} onChange={v => setForm({ ...form, brandId: v })} options={brandOptions} />
              <Field label="Product type" value={form.productType} onChange={v => setForm({ ...form, productType: v })} options={[{ value: 'STOCK', label: 'Stock' }, { value: 'SERVICE', label: 'Service' }, { value: 'RAW_MATERIAL', label: 'Raw material' }, { value: 'FINISHED_GOOD', label: 'Finished good' }, { value: 'BUNDLE', label: 'Bundle' }]} required />
              <Field label="Base unit" value={form.baseUnitId} onChange={v => setForm({ ...form, baseUnitId: v })} options={unitOptions} required />
              <Field label="Description" value={form.description} onChange={v => setForm({ ...form, description: v })} full />
              <div className="check-grid">
                <label className="check"><input type="checkbox" checked={form.isSellable} onChange={e => setForm({ ...form, isSellable: e.target.checked })} /> Sellable</label>
                <label className="check"><input type="checkbox" checked={form.isPurchasable} onChange={e => setForm({ ...form, isPurchasable: e.target.checked })} /> Purchasable</label>
                <label className="check"><input type="checkbox" checked={form.isStockItem} onChange={e => setForm({ ...form, isStockItem: e.target.checked })} /> Stock item</label>
              </div>
            </div>
          </Section>
          <Section title="Inventory controls" description="Optional tracking flags for future inventory operations.">
            <div className="check-grid">
              <label className="check"><input type="checkbox" checked={form.trackBatch} onChange={e => setForm({ ...form, trackBatch: e.target.checked })} /> Track batch</label>
              <label className="check"><input type="checkbox" checked={form.trackExpiry} onChange={e => setForm({ ...form, trackExpiry: e.target.checked })} /> Track expiry</label>
              <label className="check"><input type="checkbox" checked={form.trackSerial} onChange={e => setForm({ ...form, trackSerial: e.target.checked })} /> Track serial</label>
            </div>
          </Section>
        </>}

        {step === 1 && <Section title="Identifiers" description="Supports UPC, EAN, supplier item numbers and other identifiers.">
          <button type="button" className="btn btn-secondary" onClick={addIdentifier}>＋ Add identifier</button>
          <div className="mini-table" style={{ marginTop: 12 }}><div className="mini-head" style={{ gridTemplateColumns: '1fr 1.5fr .7fr 35px' }}><span>Type</span><span>Identifier</span><span>Primary</span><span /></div>
            {identifiers.map((x, i) => <div className="mini-row" key={i} style={{ gridTemplateColumns: '1fr 1.5fr .7fr 35px' }}>
              <select className="control" value={x.identifierTypeId} onChange={e => { const a = [...identifiers]; a[i] = { ...x, identifierTypeId: e.target.value }; setIdentifiers(a); }}><option value="">Select...</option>{identifierTypeOptions.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select>
              <input className="control" value={x.identifierValue} placeholder="049000028904" onChange={e => { const a = [...identifiers]; a[i] = { ...x, identifierValue: e.target.value }; setIdentifiers(a); }} />
              <label className="check"><input type="checkbox" checked={x.isPrimary} onChange={e => setIdentifiers(identifiers.map((v, j) => ({ ...v, isPrimary: j === i ? e.target.checked : false })))} /> Primary</label>
              <button type="button" className="icon-btn" onClick={() => setIdentifiers(identifiers.filter((_, j) => j !== i))}>×</button>
            </div>)}
          </div>
          {identifiers.length === 0 && <div className="empty">No identifiers added. You can add them now or later.</div>}
        </Section>}

        {step === 2 && <Section title="Packaging / units" description="Define purchase and sales units and conversion to the base unit.">
          <div className="mini-table"><div className="mini-head units"><span>Unit</span><span>Conversion to base</span><span>Purchase</span><span>Sales</span><span /></div>
            {productUnits.map((x, i) => <div className="mini-row units" key={i}>
              <select className="control" value={x.unitId} onChange={e => { const a = [...productUnits]; a[i] = { ...x, unitId: e.target.value }; setProductUnits(a); }}><option value="">Select...</option>{unitOptions.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select>
              <input className="control" type="number" min="0" step="0.000001" value={x.conversionFactor} onChange={e => { const a = [...productUnits]; a[i] = { ...x, conversionFactor: e.target.value }; setProductUnits(a); }} />
              <label className="check"><input type="checkbox" checked={x.isPurchaseUnit} onChange={e => { const a = [...productUnits]; a[i] = { ...x, isPurchaseUnit: e.target.checked }; setProductUnits(a); }} /> ✓</label>
              <label className="check"><input type="checkbox" checked={x.isSalesUnit} onChange={e => { const a = [...productUnits]; a[i] = { ...x, isSalesUnit: e.target.checked }; setProductUnits(a); }} /> ✓</label>
              <button type="button" className="icon-btn" onClick={() => setProductUnits(productUnits.filter((_, j) => j !== i))}>×</button>
            </div>)}
          </div>
          <button type="button" className="btn btn-secondary" onClick={addUnit}>＋ Add unit</button>
        </Section>}

        {step === 3 && <Section title="Pricing" description="Attach selling prices to the tenant's price lists and units.">
          <div className="mini-table"><div className="mini-head pricing"><span>Price list</span><span>Unit</span><span>Selling price</span><span>Minimum qty</span><span /></div>
            {prices.map((x, i) => <div className="mini-row pricing" key={i}>
              <select className="control" value={x.priceListId} onChange={e => { const a = [...prices]; a[i] = { ...x, priceListId: e.target.value }; setPrices(a); }}><option value="">Select...</option>{priceListOptions.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select>
              <select className="control" value={x.unitId} onChange={e => { const a = [...prices]; a[i] = { ...x, unitId: e.target.value }; setPrices(a); }}><option value="">Select...</option>{unitOptions.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select>
              <input className="control" type="number" step="0.01" value={x.sellingPrice} placeholder="250.00" onChange={e => { const a = [...prices]; a[i] = { ...x, sellingPrice: e.target.value }; setPrices(a); }} />
              <input className="control" type="number" min="1" value={x.minimumQuantity} onChange={e => { const a = [...prices]; a[i] = { ...x, minimumQuantity: e.target.value }; setPrices(a); }} />
              <button type="button" className="icon-btn" onClick={() => setPrices(prices.filter((_, j) => j !== i))}>×</button>
            </div>)}
          </div>
          <button type="button" className="btn btn-secondary" onClick={addPrice}>＋ Add price</button>
        </Section>}

        {step === 4 && <Section title="Locations" description="Control where the product can be sold or purchased.">
          <div className="mini-table"><div className="mini-head locations"><span>Location</span><span>Active</span><span>Sellable</span><span>Purchasable</span><span /></div>
            {locations.map((x, i) => <div className="mini-row locations" key={i}>
              <select className="control" value={x.locationId} onChange={e => { const a = [...locations]; a[i] = { ...x, locationId: e.target.value }; setLocations(a); }}><option value="">Select...</option>{locationOptions.map(o => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}</select>
              <span className="status status-on"><i />Active</span>
              <label className="check"><input type="checkbox" checked={x.isSellable} onChange={e => { const a = [...locations]; a[i] = { ...x, isSellable: e.target.checked }; setLocations(a); }} /> ✓</label>
              <label className="check"><input type="checkbox" checked={x.isPurchasable} onChange={e => { const a = [...locations]; a[i] = { ...x, isPurchasable: e.target.checked }; setLocations(a); }} /> ✓</label>
              <button type="button" className="icon-btn" onClick={() => setLocations(locations.filter((_, j) => j !== i))}>×</button>
            </div>)}
          </div>
          <button type="button" className="btn btn-secondary" onClick={addLocation}>＋ Add location</button>
        </Section>}
        {error && <div className="error-box">{error}</div>}
      </div>
      <div className="modal-foot wizard-foot"><div className="step-note">Step {step + 1} of {steps.length} · {steps[step]}</div><div><button type="button" className="btn btn-secondary" onClick={() => step === 0 ? setOpen(false) : setStep(step - 1)}>{step === 0 ? 'Cancel' : 'Back'}</button>{step < steps.length - 1 ? <button type="button" className="btn btn-primary" onClick={() => setStep(step + 1)}>Next</button> : <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Creating...' : 'Create product'}</button>}</div></div>
    </Modal>
  </div>;
}
