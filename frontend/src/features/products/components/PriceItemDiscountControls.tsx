import { useEffect, useMemo, useState } from 'react';
import { Field } from '../../../components/ui/Field';
import { Modal } from '../../../components/ui/Modal';
import { productsApi, type DiscountHistoryPage } from '../api/productsApi';

const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';
const money = (currency: string, value: string | number) => `${currency || 'LKR'} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const compactNumber = (value: string | number) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });

export function PriceItemDiscountControls({ group, productName, sku, onChanged, onError, variant = 'current', onBusyChange }: {
  group: Record<string, any>;
  productName: string;
  sku: string;
  onChanged: () => void | Promise<void>;
  onError: (message: string) => void;
  variant?: 'current' | 'schedule' | 'history';
  onBusyChange?: (busy: boolean) => void;
}) {
  const price = group.current;
  const attached = price?.currentDiscount;
  const current = attached?.status === 'CURRENT' ? attached : null;
  const [mode, setMode] = useState<'ADD' | 'CHANGE' | 'END' | null>(null);
  const [form, setForm] = useState({ discountType: 'PERCENTAGE', discountValue: '', effectiveFrom: '', effectiveTo: '' });
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState<DiscountHistoryPage | null>(null);

  const preview = useMemo(() => {
    const base = Number(price?.sellingPrice || 0);
    const value = Number(form.discountValue || 0);
    const amount = form.discountType === 'PERCENTAGE' ? base * value / 100 : value;
    return { amount: Math.max(0, amount), final: Math.max(0, base - amount) };
  }, [price?.sellingPrice, form.discountType, form.discountValue]);

  useEffect(() => {
    if (!historyOpen || !price) return;
    let active = true;
    setBusy(true);
    productsApi.discountHistory(price.priceListItemId, historyPage).then((value) => active && setHistory(value)).catch((error) => active && onError((error as Error).message)).finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [historyOpen, historyPage, price?.priceListItemId]);

  const open = (next: 'ADD' | 'CHANGE' | 'END', scheduled = false) => {
    const start = attached?.status === 'FUTURE' ? new Date(attached.effectiveFrom) : new Date();
    if (scheduled) start.setDate(start.getDate() + 1);
    else if (next !== 'END') start.setMinutes(start.getMinutes() + (next === 'CHANGE' ? 1 : 0));
    setForm({ discountType: current?.discountType ?? 'PERCENTAGE', discountValue: '', effectiveFrom: localInput(start), effectiveTo: next === 'END' ? localInput(start) : '' });
    setMode(next);
  };

  const submit = async () => {
    if (!price) return;
    if (mode !== 'END' && Number(form.discountValue) <= 0) return onError('Discount value must be greater than zero.');
    setBusy(true); onBusyChange?.(true); onError('');
    try {
      if (mode === 'END') await productsApi.endDiscount(current.priceListItemDiscountId, new Date(form.effectiveTo).toISOString());
      else {
        const payload = { discountType: form.discountType, discountValue: form.discountValue, effectiveFrom: new Date(form.effectiveFrom).toISOString(), effectiveTo: form.effectiveTo ? new Date(form.effectiveTo).toISOString() : undefined };
        if (mode === 'CHANGE') await productsApi.changeDiscount(price.priceListItemId, payload);
        else await productsApi.publishDiscount(price.priceListItemId, payload);
      }
      setMode(null); await onChanged();
    } catch (error) { onError((error as Error).message); }
    finally { setBusy(false); onBusyChange?.(false); }
  };

  if (!price) return null;
  return <>
    <div className="price-action-stack">
      {variant === 'current' && (!current ? <button type="button" className="btn btn-secondary btn-compact" disabled={busy} onClick={() => open('ADD')}>Add Discount</button> : <>
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => open('CHANGE')}>Change Discount</button>
        <button type="button" className="btn btn-ghost btn-compact" onClick={() => open('END')}>End Discount</button>
      </>)}
      {variant === 'schedule' && <button type="button" className="btn btn-secondary btn-compact" disabled={busy} onClick={() => open('ADD', true)}>+ Schedule Discount</button>}
      {variant === 'history' && <button type="button" className="btn btn-ghost btn-compact" onClick={() => { setHistoryPage(1); setHistoryOpen(true); }}>Discount History</button>}
    </div>

    <Modal open={Boolean(mode)} onClose={() => !busy && setMode(null)} title={mode === 'ADD' ? 'Add / Schedule Discount' : mode === 'CHANGE' ? 'Change Discount' : 'End Discount'}>
      <div className="modal-body">
        <div className="form-grid">
          <Field label="Product / SKU" value={`${productName} · ${sku}`} onChange={() => {}} disabled />
          <Field label="Price List / Unit" value={`${group.priceList?.name} · ${group.productUnit?.unit?.name}`} onChange={() => {}} disabled />
          <Field label="Base Selling Price" value={money(price.currencyCode, price.sellingPrice)} onChange={() => {}} disabled />
          <Field label="Parent Price Validity" value={`${dateTime(price.effectiveFrom)} – ${dateTime(price.effectiveTo)}`} onChange={() => {}} disabled />
          {mode === 'CHANGE' && <Field label="Current Discount" value={`${current.discountType === 'PERCENTAGE' ? `${current.discountValue}%` : money(price.currencyCode, current.discountValue)} → ${money(price.currencyCode, current.finalUnitPrice)}`} onChange={() => {}} disabled />}
          {mode !== 'END' ? <>
            <Field label="Discount Type" value={form.discountType} onChange={(discountType) => setForm({ ...form, discountType })} options={[{ value: 'PERCENTAGE', label: 'Percentage' }, { value: 'FIXED_AMOUNT', label: 'Fixed amount' }]} required />
            <Field label="Discount Value" type="number" value={form.discountValue} onChange={(discountValue) => setForm({ ...form, discountValue })} required />
            <Field label="Effective From" type="datetime-local" value={form.effectiveFrom} onChange={(effectiveFrom) => setForm({ ...form, effectiveFrom })} required />
            <Field label="Effective To" type="datetime-local" value={form.effectiveTo} onChange={(effectiveTo) => setForm({ ...form, effectiveTo })} />
          </> : <Field label="End Date / Time" type="datetime-local" value={form.effectiveTo} onChange={(effectiveTo) => setForm({ ...form, effectiveTo })} required />}
        </div>
        {mode !== 'END' ? <div className="success-box">Preview: discount {money(price.currencyCode, preview.amount)} · final {money(price.currencyCode, preview.final)} · {new Date(form.effectiveFrom) <= new Date() ? 'Immediate' : 'Scheduled'}</div> : <div className="warning-box">After this discount ends, the base price {money(price.currencyCode, price.sellingPrice)} applies. The parent price remains active.</div>}
      </div>
      <div className="modal-foot"><button className="btn btn-secondary" onClick={() => setMode(null)}>Cancel</button><button className="btn btn-primary" disabled={busy || !form.effectiveTo && mode === 'END'} onClick={() => void submit()}>{busy ? 'Saving…' : mode === 'END' ? 'End Discount' : 'Publish Discount'}</button></div>
    </Modal>

    <Modal open={historyOpen} onClose={() => setHistoryOpen(false)} title="Discount History" subtitle={`${group.priceList?.name} · ${group.productUnit?.unit?.name}`} wide>
      <div className="modal-body"><div className="history-table">
        <div className="history-table-row head"><span>Discount</span><span>Base / Final</span><span>Effective From</span><span>Effective To</span><span>Status</span><span>Audit</span></div>
        {history?.items.map((row: any) => <div className="history-table-row" key={row.priceListItemDiscountId}><span>{row.discountType === 'PERCENTAGE' ? `${compactNumber(row.discountValue)}%` : money(price.currencyCode, row.discountValue)}</span><span>{money(price.currencyCode, row.basePrice)} → <strong>{money(price.currencyCode, row.finalUnitPrice)}</strong></span><span>{dateTime(row.effectiveFrom)}</span><span>{dateTime(row.effectiveTo)}</span><span className={`status ${row.status === 'CURRENT' ? 'status-on' : row.status === 'FUTURE' ? 'status-warn' : 'status-off'}`}>{row.status}</span><span>Created: {row.createdBy?.username ?? row.createdBy?.userId}<br />{row.endedBy ? `Ended: ${row.endedBy.username ?? row.endedBy.userId}` : ''}</span></div>)}
        {!busy && !history?.items.length && <div className="empty">No discount history.</div>}
      </div><div className="history-pagination"><span>{history?.totalItems ?? 0} discounts</span><div><button className="btn btn-secondary" disabled={historyPage <= 1 || busy} onClick={() => setHistoryPage((value) => value - 1)}>Previous</button><span>Page {history?.page ?? 1} of {history?.totalPages ?? 1}</span><button className="btn btn-secondary" disabled={historyPage >= (history?.totalPages ?? 1) || busy} onClick={() => setHistoryPage((value) => value + 1)}>Next</button></div></div></div>
      <div className="modal-foot"><button className="btn btn-secondary" onClick={() => setHistoryOpen(false)}>Close</button></div>
    </Modal>
  </>;
}
