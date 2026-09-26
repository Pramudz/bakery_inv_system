import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import {
  inventoryConversionsApi,
  type AllocationMethod,
  type ConversionInput,
  type ConversionMovementType,
  type ConversionProductContext,
} from "../api/inventoryConversionsApi";
import {
  allocationMethodLabel,
  allocationPreviews,
  avalEstimatedValue,
  baseQuantity,
  blankConversionForm,
  defaultProductUnit,
  formFromConversion,
  money,
  normalizeConversionForm,
  quantity,
  round4,
  selectedUnit,
  statusLabel,
  totalAvalValue,
  type ConversionForm,
  type ConversionFormLine,
} from "../inventoryConversionForm";

type ScreenMode = "create" | "edit" | "view";

export function InventoryConversionScreen({ mode }: { mode: ScreenMode }) {
  const auth = useAuth();
  const { id = "new" } = useParams();
  const permission = mode === "create" ? "INVENTORY_VALUE_ADJUSTMENT_CREATE" : mode === "edit" ? "INVENTORY_VALUE_ADJUSTMENT_UPDATE" : "INVENTORY_VALUE_ADJUSTMENT_VIEW";
  if (!auth.permissions.includes(permission)) return <div className="card empty">You do not have permission to {mode} Inventory Conversions.</div>;
  if (mode !== "create" && (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)) return <div className="card empty">Invalid Inventory Conversion link.</div>;
  return <InventoryConversionFormPage key={`${auth.tenant?.tenantId}:${auth.tenantUser?.userId}:${mode}:${id}`} mode={mode} id={id} />;
}

function InventoryConversionFormPage({ mode, id }: { mode: ScreenMode; id: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const returnPath = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnTo = returnPath && /^\/inventory\/value-adjustments(?:\?|$)/.test(returnPath) ? returnPath : "/inventory/value-adjustments";
  const storageKey = `inventory-conversion-form:${auth.tenant?.tenantId}:${auth.tenantUser?.userId}:${mode}:${id}`;
  const conversion = useQuery({ queryKey: ["inventory-conversions", auth.tenant?.tenantId, id], queryFn: () => inventoryConversionsApi.get(Number(id)), enabled: mode !== "create" });
  const locations = useQuery({ queryKey: ["inventory-conversion-locations", auth.tenant?.tenantId, auth.tenantUser?.userId], queryFn: inventoryConversionsApi.locations });
  const [form, setForm] = useState<ConversionForm>(() => blankConversionForm(auth.accessScope === "LOCATION" ? String(auth.currentLocationId ?? "") : ""));
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [postOpen, setPostOpen] = useState(false);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const initialized = useRef(false);
  const suppressStorage = useRef(false);
  const postingId = useRef<number | null>(null);
  const quantityInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const unitInputs = useRef<Record<string, HTMLSelectElement | null>>({});
  const rowInputs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const status = conversion.data?.status ?? "DRAFT";
  const editable = mode !== "view" && (mode === "create" || status === "DRAFT");
  const posted = status === "POSTED";

  useEffect(() => {
    if (initialized.current) return;
    if (mode === "create") {
      initialized.current = true;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { form?: ConversionForm };
          if (parsed.form) { setForm(normalizeConversionForm(parsed.form)); setDirty(true); setRestored(true); }
        }
      } catch { /* Fresh form remains usable. */ }
      setReady(true);
      return;
    }
    if (!conversion.data) return;
    initialized.current = true;
    void (async () => {
      const pairs = conversion.data!.status === "POSTED" ? [] : await Promise.all((conversion.data?.lines ?? []).map(async line => {
        try {
          const page = await inventoryConversionsApi.productContexts({ locationId: Number(conversion.data!.locationId), productId: Number(line.productId) });
          return [Number(line.productId), page.items[0]] as const;
        } catch { return [Number(line.productId), undefined] as const; }
      }));
      const contexts = new Map<number, ConversionProductContext>(pairs.filter((pair): pair is readonly [number, ConversionProductContext] => Boolean(pair[1])));
      let next = formFromConversion(conversion.data!, contexts);
      if (editable) {
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { form?: ConversionForm };
            if (parsed.form) { next = normalizeConversionForm(parsed.form); setDirty(true); setRestored(true); }
          }
        } catch { /* Server draft remains authoritative. */ }
      }
      setForm(next); setReady(true);
    })();
  }, [conversion.data, editable, mode, storageKey]);

  useEffect(() => {
    if (!ready || !editable || !dirty || suppressStorage.current) return;
    const timer = window.setTimeout(() => {
      try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, form })); } catch { /* Optional. */ }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [dirty, editable, form, ready, storageKey]);

  const activeLocations = (locations.data ?? []).filter(item => item.isActive && (auth.accessScope !== "LOCATION" || auth.assignedLocations.some(assigned => String(assigned.locationId) === String(item.locationId))));
  const clearDraft = () => { suppressStorage.current = true; try { sessionStorage.removeItem(storageKey); } catch { /* Optional. */ } };
  const change = (next: ConversionForm) => { setForm(next); setDirty(true); setError(""); };
  const changeHeader = (patch: Partial<ConversionForm>) => {
    let next = { ...form, ...patch };
    let locationLinesCleared = false;
    if (patch.locationId !== undefined && patch.locationId !== form.locationId && (form.avalLines.length || form.avinLines.length)) {
      next = { ...next, avalLines: [], avinLines: [] };
      locationLinesCleared = true;
    }
    if (patch.allocationMethod && patch.allocationMethod !== form.allocationMethod) {
      next = {
        ...next,
        avinLines: next.avinLines.map(line => ({
          ...line,
          allocationPercent: "",
          allocationWeight: patch.allocationMethod === "BY_WEIGHT" && !line.allocationWeightOverridden
            ? line.quantity
            : line.allocationWeight,
        })),
      };
    }
    change(next);
    if (locationLinesCleared) setError("Product lines were cleared because stock and WAVG are location-specific.");
  };
  const linesFor = (movementType: ConversionMovementType) => movementType === "AVAL" ? form.avalLines : form.avinLines;
  const setLines = (movementType: ConversionMovementType, lines: ConversionFormLine[]) => change({ ...form, ...(movementType === "AVAL" ? { avalLines: lines } : { avinLines: lines }) });
  const changeLine = (movementType: ConversionMovementType, index: number, patch: Partial<ConversionFormLine>) => setLines(movementType, linesFor(movementType).map((line, lineIndex) => {
    if (lineIndex !== index) return line;
    const next = { ...line, ...patch };
    if (movementType === "AVIN" && form.allocationMethod === "BY_WEIGHT") {
      if (patch.allocationWeight !== undefined) next.allocationWeightOverridden = true;
      else if (patch.quantity !== undefined && !line.allocationWeightOverridden) next.allocationWeight = patch.quantity;
    }
    return next;
  }));
  const addProduct = (movementType: ConversionMovementType, product: ConversionProductContext) => {
    const sameSide = linesFor(movementType).find(line => line.productId === product.productId);
    const otherSide = linesFor(movementType === "AVAL" ? "AVIN" : "AVAL").find(line => line.productId === product.productId);
    const existing = sameSide ?? otherSide;
    if (existing) {
      setError(otherSide ? "This product cannot be used as both AVAL input and AVIN output in the same conversion." : "This product is already used in this conversion.");
      rowInputs.current[existing.productId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      quantityInputs.current[existing.key]?.focus();
      return false;
    }
    if (!product.productUnits.length) { setError("This product has no active ProductUnit."); return false; }
    const unit = defaultProductUnit(product);
    const key = `${movementType}-${Date.now()}-${product.productId}`;
    const line: ConversionFormLine = {
      key, movementType, productId: product.productId, sku: product.sku, productName: product.productName,
      baseUnitLabel: product.baseUnit.symbol ?? product.baseUnit.code, productUnits: product.productUnits,
      productUnitId: unit ? String(unit.productUnitId) : "", quantity: "", currentStock: product.quantityOnHand,
      currentWavg: product.averageCost, hasInventoryBalance: product.hasInventoryBalance,
      allocationPercent: "", allocationWeight: "", allocationWeightOverridden: false, remarks: "",
    };
    setLines(movementType, [...linesFor(movementType), line]);
    window.setTimeout(() => unit ? quantityInputs.current[key]?.focus() : unitInputs.current[key]?.focus(), 0);
    return true;
  };

  function payload(): ConversionInput {
    if (!Number(form.locationId)) throw new Error("Select an active, assigned location.");
    if (!form.avalLines.length) throw new Error("Add at least one AVAL source line.");
    if (!form.avinLines.length) throw new Error("Add at least one AVIN output line.");
    const seen = new Set<number>();
    const all = [...form.avalLines, ...form.avinLines];
    const manualTotal = form.avinLines.reduce((sum, line) => sum + Number(line.allocationPercent || 0), 0);
    if (form.allocationMethod === "MANUAL_PERCENT" && Math.abs(manualTotal - 100) > 0.0001) throw new Error("AVIN allocation percentages must total 100%.");
    return {
      locationId: Number(form.locationId), allocationMethod: form.allocationMethod, remarks: form.remarks.trim() || undefined,
      lines: all.map(line => {
        if (seen.has(line.productId)) throw new Error("A product can appear only once in this conversion.");
        seen.add(line.productId);
        if (!line.productUnitId || !selectedUnit(line)) throw new Error(`Select an active unit for ${line.productName}.`);
        if (!line.quantity || Number(line.quantity) <= 0) throw new Error(`Quantity for ${line.productName} must be greater than zero.`);
        if (line.movementType === "AVIN" && form.allocationMethod === "MANUAL_PERCENT" && Number(line.allocationPercent) <= 0) throw new Error(`Allocation percentage for ${line.productName} must be greater than zero.`);
        if (line.movementType === "AVIN" && form.allocationMethod === "BY_WEIGHT" && Number(line.allocationWeight) <= 0) throw new Error(`Allocation weight for ${line.productName} must be greater than zero.`);
        return {
          movementType: line.movementType, productId: line.productId, productUnitId: Number(line.productUnitId), quantity: line.quantity,
          ...(line.movementType === "AVIN" && form.allocationMethod === "MANUAL_PERCENT" ? { allocationPercent: line.allocationPercent } : {}),
          ...(line.movementType === "AVIN" && form.allocationMethod === "BY_WEIGHT" ? { allocationWeight: line.allocationWeight } : {}),
          remarks: line.remarks.trim() || undefined,
        };
      }),
    };
  }
  const persist = async () => {
    if (!editable && mode === "view") return Number(id);
    const data = payload();
    if (postingId.current) { await inventoryConversionsApi.update(postingId.current, data); return postingId.current; }
    if (mode === "create") { const created = await inventoryConversionsApi.create(data); return Number(created.inventoryConversionId); }
    await inventoryConversionsApi.update(Number(id), data); return Number(id);
  };
  const save = useMutation({ mutationFn: persist, onSuccess: async () => { clearDraft(); setDirty(false); await client.invalidateQueries({ queryKey: ["inventory-conversions"] }); navigate(returnTo); }, onError: (failure: Error) => setError(failure.message) });
  const post = useMutation({
    mutationFn: async (confirmNegativeStock: boolean) => {
      assertPostingPreview(form);
      const conversionId = postingId.current ?? await persist(); postingId.current = conversionId;
      return { conversionId, posted: await inventoryConversionsApi.post(conversionId, { confirmNegativeStock }) };
    },
    onSuccess: async result => { clearDraft(); setDirty(false); setPostOpen(false); setNegativeOpen(false); await client.invalidateQueries({ queryKey: ["inventory-conversions"] }); navigate(`/inventory/value-adjustments/${result.conversionId}`, { replace: mode === "edit", state: { returnTo } }); },
    onError: (failure: Error) => { if (/negative stock/i.test(failure.message)) { setPostOpen(false); setNegativeOpen(true); setError(""); } else setError(failure.message); },
  });
  const cancel = useMutation({ mutationFn: () => inventoryConversionsApi.cancel(Number(id)), onSuccess: async () => { clearDraft(); setCancelOpen(false); await client.invalidateQueries({ queryKey: ["inventory-conversions"] }); navigate(`/inventory/value-adjustments/${id}`, { replace: true, state: { returnTo } }); }, onError: (failure: Error) => setError(failure.message) });

  if (mode !== "create" && conversion.isError) return <div className="card empty" role="alert">{conversion.error.message} <button className="btn btn-secondary" onClick={() => void conversion.refetch()}>Retry</button></div>;
  if (!ready || locations.isLoading) return <div className="card empty">Loading Inventory Conversion…</div>;
  const previews = allocationPreviews(form);
  const estimatedAval = totalAvalValue(form);
  const estimatedAvin = round4(previews.reduce((sum, row) => sum + row.allocatedValue, 0));
  const estimatedVariance = round4(estimatedAvin - estimatedAval);
  const manualTotal = round4(form.avinLines.reduce((sum, line) => sum + Number(line.allocationPercent || 0), 0));
  const totalWeight = round4(form.avinLines.reduce((sum, line) => sum + Number(line.allocationWeight || 0), 0));
  const totalOutputQty = round4(form.avinLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0));
  const busy = save.isPending || post.isPending || cancel.isPending;
  const canPost = status === "DRAFT" && auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_POST");
  const title = mode === "create" ? "Create Inventory Conversion" : `${mode === "view" ? "View" : "Edit"} Inventory Conversion — ${conversion.data?.conversionNumber ?? `Draft #${id}`}`;

  return (
    <div className="direct-grn-page adjustment-page inventory-adjustments-page inventory-conversion-page">
      <header className="page-head direct-grn-head"><div><div className="direct-grn-title-row"><h1>{title}</h1><span className="grn-status-badge">{statusLabel(status)}</span></div><div className="direct-grn-breadcrumb">Inventory / <button type="button" onClick={() => navigate(returnTo)}>Value Adjustments / Conversions</button> / {mode === "create" ? "Create" : mode === "edit" ? "Edit" : "View"}</div></div></header>
      {restored && editable && <p className="grn-restored-message" role="status">Your unsaved Inventory Conversion draft has been restored.</p>}
      {mode === "edit" && !editable && <p className="grn-restored-message">This conversion is {statusLabel(status)} and is read-only.</p>}
      {locations.error && <p className="error" role="alert">Conversion configuration could not be loaded: {locations.error.message}</p>}
      <form onSubmit={event => { event.preventDefault(); if (editable && !busy) save.mutate(); }}>
        <fieldset disabled={busy} className="po-fieldset"><div className="direct-grn-layout"><main className="direct-grn-main">
          <section className="direct-grn-card"><h2>Conversion Details</h2><div className="adjustment-header-fields">
            <label className="field"><span>Conversion No</span><input className="control" readOnly value={conversion.data?.conversionNumber ?? "Generated when posted"} /></label>
            <label className="field"><span>Conversion Date</span><input className="control" readOnly value={conversion.data?.conversionDate?.slice(0,10) ?? "Assigned by backend on save"} /></label>
            <label className="field"><span>Location *</span><select className="control" disabled={!editable} value={form.locationId} onChange={event => changeHeader({ locationId: event.target.value })}><option value="">Select location</option>{activeLocations.map(item => <option key={item.locationId} value={item.locationId}>{item.name}</option>)}</select></label>
            <label className="field"><span>Allocation Method *</span><select className="control" disabled={!editable} value={form.allocationMethod} onChange={event => changeHeader({ allocationMethod: event.target.value as AllocationMethod })}><option value="MANUAL_PERCENT">Manual Percent</option><option value="BY_EXISTING_WAVG">By Existing WAVG</option><option value="BY_WEIGHT">By Weight</option></select></label>
            <label className="field conversion-remarks"><span>Remarks</span><textarea className="control" readOnly={!editable} maxLength={4000} rows={2} value={form.remarks} onChange={event => changeHeader({ remarks: event.target.value })} /></label>
          </div><div className="adjustment-policy-note"><strong>{allocationMethodLabel(form.allocationMethod)}</strong><span>{form.allocationMethod === "MANUAL_PERCENT" ? "Enter a positive percentage for every AVIN output; total must be 100%." : form.allocationMethod === "BY_EXISTING_WAVG" ? "Output base quantity × existing WAVG determines each allocation share. No fallback pricing is used." : "Enter all output weights using the same physical weight basis."}</span></div></section>

          <ConversionLinesSection movementType="AVAL" title="AVAL — Source Items" editable={editable} posted={posted} form={form} previews={previews} onAdd={addProduct} onChangeLine={changeLine} onRemove={index => setLines("AVAL", form.avalLines.filter((_, row) => row !== index))} quantityInputs={quantityInputs} unitInputs={unitInputs} rowInputs={rowInputs} />
          <ConversionLinesSection movementType="AVIN" title="AVIN — Output Items" editable={editable} posted={posted} form={form} previews={previews} onAdd={addProduct} onChangeLine={changeLine} onRemove={index => setLines("AVIN", form.avinLines.filter((_, row) => row !== index))} quantityInputs={quantityInputs} unitInputs={unitInputs} rowInputs={rowInputs} />

        </main>
        <aside className="direct-summary-card conversion-summary-card" aria-label="Inventory Conversion summary">
          <h2>{posted ? "Posted Reconciliation" : "Allocation / Reconciliation Summary"}</h2>
          <div><span>Allocation Method</span><b>{allocationMethodLabel(form.allocationMethod)}</b></div>
          <div><span>Total AVAL lines</span><b>{form.avalLines.length}</b></div>
          <div><span>Total AVIN lines</span><b>{form.avinLines.length}</b></div>
          <div><span>Total output qty</span><b>{quantity(totalOutputQty)}</b></div>
          {form.allocationMethod === "BY_WEIGHT" && <div><span>Total allocation weight</span><b>{quantity(totalWeight)}</b></div>}
          {form.allocationMethod === "MANUAL_PERCENT" && <div><span>Allocation total %</span><b className={!posted && Math.abs(manualTotal - 100) > 0.0001 ? "error" : ""}>{manualTotal.toFixed(4)}%</b></div>}
          <hr />
          <div><span>{posted ? "Total AVAL Posted Value" : "Estimated Total AVAL Value"}</span><b>{posted ? conversion.data?.totalInputValue != null ? `Rs ${money(conversion.data.totalInputValue)}` : "—" : `Rs ${money(estimatedAval)}`}</b></div>
          <div><span>{posted ? "Total AVIN Posted Value" : "Estimated Total AVIN Value"}</span><b>{posted ? conversion.data?.totalOutputValue != null ? `Rs ${money(conversion.data.totalOutputValue)}` : "—" : `Rs ${money(estimatedAvin)}`}</b></div>
          <hr />
          <strong>{posted ? "Variance" : "Estimated Variance"}</strong>
          <b className={Number(posted ? conversion.data?.valueVariance ?? 0 : estimatedVariance) !== 0 ? "error" : ""}>{posted ? conversion.data?.valueVariance != null ? `Rs ${money(conversion.data.valueVariance)}` : "—" : `Rs ${money(estimatedVariance)}`}</b>
          <p className="direct-integration-note">{posted ? "Historical totals captured by backend posting." : "Preview only. Backend posting values remain authoritative."}</p>
        </aside>
        </div></fieldset>
        {error && <p className="error conversion-form-error" role="alert">{error}</p>}
        <div className="direct-grn-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => dirty && editable ? setDiscardOpen(true) : navigate(returnTo)}>Back</button>{editable && <button type="submit" className="btn btn-secondary" disabled={busy}>{save.isPending ? "Saving…" : "Save Draft"}</button>}{canPost && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { try { payload(); assertPostingPreview(form); setError(""); setPostOpen(true); } catch (failure) { setError(failure instanceof Error ? failure.message : "Conversion is not ready to post."); } }}>Post Conversion</button>}{status === "DRAFT" && mode !== "create" && auth.permissions.includes("INVENTORY_VALUE_ADJUSTMENT_CANCEL") && <button type="button" className="btn btn-danger-soft" disabled={busy} onClick={() => setCancelOpen(true)}>Cancel Draft</button>}</div>
      </form>
      <Modal open={postOpen} title="Post this Inventory Conversion?" onClose={() => !post.isPending && setPostOpen(false)}><div className="modal-body"><p>The latest draft will be saved first, then all AVAL and AVIN inventory movements will post atomically.</p>{error && <p className="error">{error}</p>}</div><div className="modal-foot"><button className="btn btn-secondary" disabled={post.isPending} onClick={() => setPostOpen(false)}>Keep as draft</button><button className="btn btn-primary" disabled={post.isPending} onClick={() => post.mutate(false)}>{post.isPending ? "Posting…" : "Save & Post"}</button></div></Modal>
      <Modal open={negativeOpen} title="Negative stock confirmation" onClose={() => !post.isPending && setNegativeOpen(false)}><div className="modal-body"><p>This conversion will cause negative stock for one or more AVAL products. Do you want to continue?</p>{error && <p className="error">{error}</p>}</div><div className="modal-foot"><button className="btn btn-secondary" disabled={post.isPending} onClick={() => setNegativeOpen(false)}>Cancel</button><button className="btn btn-danger-soft" disabled={post.isPending} onClick={() => post.mutate(true)}>{post.isPending ? "Posting…" : "Post Anyway"}</button></div></Modal>
      <Modal open={cancelOpen} title="Cancel this draft Inventory Conversion?" onClose={() => !cancel.isPending && setCancelOpen(false)}><div className="modal-body"><p>The cancelled document remains available for audit and becomes read-only.</p></div><div className="modal-foot"><button className="btn btn-secondary" disabled={cancel.isPending} onClick={() => setCancelOpen(false)}>Keep draft</button><button className="btn btn-danger-soft" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? "Cancelling…" : "Cancel Conversion"}</button></div></Modal>
      <Modal open={discardOpen} title="Discard unsaved changes?" onClose={() => setDiscardOpen(false)}><div className="modal-body"><p>Your restored or edited draft values will be removed from this browser.</p></div><div className="modal-foot"><button className="btn btn-secondary" onClick={() => setDiscardOpen(false)}>Keep editing</button><button className="btn btn-danger-soft" onClick={() => { clearDraft(); navigate(returnTo); }}>Discard</button></div></Modal>
    </div>
  );
}

function ProductSearch({ movementType, locationId, onSelect }: { movementType: ConversionMovementType; locationId: string; onSelect: (product: ConversionProductContext) => boolean }) {
  const auth = useAuth();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => setActive(-1), [debounced, locationId]);
  const query = useQuery({ queryKey: ["inventory-conversion-products", auth.tenant?.tenantId, locationId, movementType, debounced], queryFn: () => inventoryConversionsApi.productContexts({ locationId: Number(locationId), search: debounced }), enabled: Number(locationId) > 0 && Boolean(debounced) });
  const results = query.data?.items ?? [];
  const select = (product: ConversionProductContext) => { if (onSelect(product)) { setSearch(""); setDebounced(""); setOpen(false); setActive(-1); } };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); setActive(-1); }
    else if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); if (results.length) setActive(current => Math.min(current < 0 ? 0 : current + 1, results.length - 1)); }
    else if (event.key === "ArrowUp") { event.preventDefault(); if (results.length) setActive(current => current <= 0 ? 0 : current - 1); }
    else if (event.key === "Enter" && open) { event.preventDefault(); const selected = active >= 0 ? results[active] : results.length === 1 ? results[0] : undefined; if (selected) select(selected); }
  };
  return <div className="direct-product-search conversion-product-search"><span aria-hidden="true">⌕</span><input value={search} disabled={!locationId} placeholder={locationId ? `Search ${movementType} product by SKU or name` : "Select a location before adding products"} aria-label={`Search ${movementType} products`} aria-expanded={open && Boolean(search.trim())} onFocus={() => setOpen(true)} onChange={event => { setSearch(event.target.value); setOpen(true); }} onKeyDown={keyDown} />{locationId && open && search.trim() && <div className="direct-product-results" role="listbox">{query.isFetching || search.trim() !== debounced ? <p className="direct-product-empty">Searching products…</p> : query.isError ? <p className="direct-product-empty" role="alert">{query.error.message} <button type="button" onClick={() => void query.refetch()}>Retry</button></p> : results.length ? results.map((product,index) => <button type="button" role="option" aria-selected={index === active} className={index === active ? "active" : ""} key={product.productId} onMouseMove={() => setActive(index)} onClick={() => select(product)}><strong>{product.productName}</strong><span>{product.sku} · {product.baseUnit.symbol ?? product.baseUnit.code} · Stock {quantity(product.quantityOnHand)} · WAVG {product.averageCost != null ? `Rs ${money(product.averageCost)}` : "—"}</span></button>) : <p className="direct-product-empty">No active stock products found at this location.</p>}</div>}</div>;
}

interface SectionProps {
  movementType: ConversionMovementType; title: string; editable: boolean; posted: boolean; form: ConversionForm;
  previews: ReturnType<typeof allocationPreviews>; onAdd: (movementType: ConversionMovementType, product: ConversionProductContext) => boolean;
  onChangeLine: (movementType: ConversionMovementType, index: number, patch: Partial<ConversionFormLine>) => void; onRemove: (index: number) => void;
  quantityInputs: React.MutableRefObject<Record<string, HTMLInputElement | null>>; unitInputs: React.MutableRefObject<Record<string, HTMLSelectElement | null>>; rowInputs: React.MutableRefObject<Record<number, HTMLTableRowElement | null>>;
}

function ConversionLinesSection(props: SectionProps) {
  const { movementType, title, editable, posted, form } = props;
  const lines = movementType === "AVAL" ? form.avalLines : form.avinLines;
  const postedBasisTotal = movementType === "AVIN" ? lines.reduce((sum, line) => sum + Number(line.postedAllocationBasis ?? 0), 0) : 0;
  const postedHeaders = movementType === "AVAL"
    ? ["Product", "Unit", "Stock Before", "Posted Qty", "Base Qty", "Stock After", "WAVG Before", "Posted Unit Cost", "Posted Value", "WAVG After"]
    : ["Product", "Unit", "Stock Before", "Posted Qty", "Base Qty", "Stock After", "WAVG Before", "Allocation %", "Allocation Basis", "Allocated Value", "Posted Unit Cost", "Posted Value", "WAVG After"];
  const draftHeaders = movementType === "AVAL"
    ? ["Product", "Unit", "Current Stock", "Current WAVG", "Qty", "Base Qty", "Resulting Stock", "Est. Unit Cost", "Estimated Value", ...(editable ? ["Remove"] : [])]
    : ["Product", "Unit", "Existing Stock", "Existing WAVG", "Qty", "Base Qty", "Allocation Input", "Allocation %", "Allocated Value", "Transaction Unit Cost", "Resulting Stock", "Resulting WAVG", ...(editable ? ["Remove"] : [])];
  const postedColumnWidths = movementType === "AVAL"
    ? [240, 120, 130, 120, 120, 130, 130, 150, 140, 130]
    : [240, 120, 130, 120, 120, 130, 130, 120, 150, 150, 150, 140, 130];
  const headers = posted ? postedHeaders : draftHeaders;
  return <section className={`direct-grn-card conversion-lines-section conversion-${movementType.toLowerCase()}`}><div className="conversion-section-head"><div><h2>{title}</h2><p>{movementType === "AVAL" ? "Source inventory is relieved at current WAVG." : "Allocated source value establishes the inbound transaction cost."}</p></div><span className={`conversion-side-badge ${movementType.toLowerCase()}`}>{movementType} · {movementType === "AVAL" ? "OUT" : "IN"}</span></div>
    {editable && <><ProductSearch movementType={movementType} locationId={form.locationId} onSelect={product => props.onAdd(movementType, product)} /><p className="direct-integration-note">Use Arrow Up/Down and Enter to select. Escape closes results. Unit remains editable after selection.</p></>}
    <div className="table-wrap conversion-lines-wrap"><table className={`conversion-lines-table${posted ? ` conversion-lines-table-posted conversion-lines-table-posted-${movementType.toLowerCase()}` : ""}`}>
      {posted && <colgroup>{postedColumnWidths.map((width, index) => <col key={`${movementType}-${headers[index]}`} style={{ width }} />)}</colgroup>}
      <thead><tr>{headers.map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
      {!lines.length ? <tr><td className="direct-lines-empty" colSpan={headers.length}>No {movementType} products added yet.</td></tr> : lines.map((line,index) => {
        const baseQty = posted ? Number(line.postedBaseQuantity ?? 0) : baseQuantity(line);
        const preview = movementType === "AVIN" ? props.previews[index] : undefined;
        const wavg = Number(line.currentWavg ?? 0);
        const invalidWavg = movementType === "AVAL" ? (!line.hasInventoryBalance || wavg <= 0) : Number(line.currentStock) > 0 && wavg <= 0;
        const allocationInvalid = movementType === "AVIN" && form.allocationMethod === "BY_EXISTING_WAVG" && (!line.hasInventoryBalance || wavg <= 0);
        return <tr key={line.key} ref={element => { props.rowInputs.current[line.productId] = element; }}><td data-label="Product"><div className="direct-product-cell"><strong>{line.productName}</strong><span>{line.sku}</span>{!posted && invalidWavg && <small className="error">{movementType === "AVAL" ? "Current positive WAVG is required for AVAL posting." : "Positive existing stock requires a positive WAVG."}</small>}{!posted && allocationInvalid && <small className="error">Existing WAVG is required for BY_EXISTING_WAVG allocation.</small>}</div></td><td data-label="Unit">{editable ? <select ref={element => { props.unitInputs.current[line.key] = element; }} className="control" value={line.productUnitId} onChange={event => props.onChangeLine(movementType,index,{ productUnitId:event.target.value })}><option value="">Select unit</option>{line.productUnits.map(unit => <option key={unit.productUnitId} value={unit.productUnitId}>{unit.unit.name} (×{unit.conversionFactor})</option>)}</select> : selectedUnit(line)?.unit.name ?? "—"}</td>
          {posted ? <PostedCells line={line} movementType={movementType} allocationMethod={form.allocationMethod} postedBasisTotal={postedBasisTotal} /> : movementType === "AVAL" ? <><td className="right">{quantity(line.currentStock)} {line.baseUnitLabel}</td><td className="right">{line.currentWavg != null ? `Rs ${money(line.currentWavg)}` : "—"}</td><QuantityCell line={line} editable={editable} onChange={value => props.onChangeLine(movementType,index,{ quantity:value })} inputRef={element => { props.quantityInputs.current[line.key] = element; }} /><td className="right">{quantity(baseQty)} {line.baseUnitLabel}</td><td className={`right${Number(line.currentStock)-baseQty<0?" error":""}`}>{quantity(Number(line.currentStock)-baseQty)} {line.baseUnitLabel}</td><td className="right">{line.currentWavg != null ? `Rs ${money(line.currentWavg)}` : "—"}</td><td className="right">Rs {money(avalEstimatedValue(line))}</td>{editable && <td><button type="button" className="btn btn-danger-soft" onClick={() => props.onRemove(index)}>Remove</button></td>}</> : <><td className="right">{quantity(line.currentStock)} {line.baseUnitLabel}</td><td className="right">{line.currentWavg != null ? `Rs ${money(line.currentWavg)}` : "—"}</td><QuantityCell line={line} editable={editable} onChange={value => props.onChangeLine(movementType,index,{ quantity:value })} inputRef={element => { props.quantityInputs.current[line.key] = element; }} /><td className="right">{quantity(baseQty)} {line.baseUnitLabel}</td><td>{form.allocationMethod === "MANUAL_PERCENT" ? <input className="control" type="number" min="0.0001" step="0.0001" value={line.allocationPercent} onChange={event => props.onChangeLine(movementType,index,{ allocationPercent:event.target.value })} aria-label={`Allocation percent for ${line.productName}`} /> : form.allocationMethod === "BY_WEIGHT" ? <input className="control" type="number" min="0.0001" step="0.0001" value={line.allocationWeight} onChange={event => props.onChangeLine(movementType,index,{ allocationWeight:event.target.value })} aria-label={`Allocation weight for ${line.productName}`} /> : `Rs ${money(preview?.basis)}`}</td><td className="right">{preview?.valid ? `${preview.percent.toFixed(4)}%` : "—"}</td><td className="right">{preview?.valid ? `Rs ${money(preview.allocatedValue)}` : "—"}</td><td className="right">{preview?.valid ? `Rs ${money(preview.transactionUnitCost)}` : "—"}</td><td className="right">{quantity(preview?.resultingStock)} {line.baseUnitLabel}</td><td className="right">{preview?.resultingWavg != null ? `Rs ${money(preview.resultingWavg)}` : "—"}</td>{editable && <td><button type="button" className="btn btn-danger-soft" onClick={() => props.onRemove(index)}>Remove</button></td>}</>}
        </tr>;
      })}
    </tbody></table></div>
  </section>;
}

function QuantityCell({ line, editable, onChange, inputRef }: { line: ConversionFormLine; editable: boolean; onChange: (value: string) => void; inputRef: (element: HTMLInputElement | null) => void }) {
  return <td data-label="Qty">{editable ? <input ref={inputRef} className="control" type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={event => onChange(event.target.value)} aria-label={`Quantity for ${line.productName}`} /> : quantity(line.quantity)}</td>;
}

function PostedCells({ line, movementType, allocationMethod, postedBasisTotal }: { line: ConversionFormLine; movementType: ConversionMovementType; allocationMethod: AllocationMethod; postedBasisTotal: number }) {
  const derivedPercent = postedBasisTotal > 0 && line.postedAllocationBasis != null
    ? Number(line.postedAllocationBasis) / postedBasisTotal * 100
    : null;
  const allocationBasis = line.postedAllocationBasis == null
    ? "—"
    : allocationMethod === "BY_EXISTING_WAVG"
      ? `Rs ${money(line.postedAllocationBasis)}`
      : allocationMethod === "MANUAL_PERCENT"
        ? `${Number(line.postedAllocationBasis).toFixed(4)}%`
        : quantity(line.postedAllocationBasis);
  const cells: Array<{ label: string; value: string }> = [
    { label:"Stock Before",value:line.postedQuantityBefore != null?`${quantity(line.postedQuantityBefore)} ${line.baseUnitLabel}`:"—" },
    { label:"Posted Qty",value:quantity(line.quantity) },
    { label:"Base Qty",value:line.postedBaseQuantity != null?`${quantity(line.postedBaseQuantity)} ${line.baseUnitLabel}`:"—" },
    { label:"Stock After",value:line.postedQuantityAfter != null?`${quantity(line.postedQuantityAfter)} ${line.baseUnitLabel}`:"—" },
    { label:"WAVG Before",value:line.postedWavgBefore != null?`Rs ${money(line.postedWavgBefore)}`:"—" },
  ];
  if (movementType === "AVIN") cells.push(
    { label:"Allocation %",value:line.allocationPercent !== ""?`${Number(line.allocationPercent).toFixed(4)}%`:derivedPercent != null?`${derivedPercent.toFixed(4)}%`:"—" },
    { label:"Allocation Basis",value:allocationBasis },
    { label:"Allocated Value",value:line.postedAllocatedValue != null?`Rs ${money(line.postedAllocatedValue)}`:"—" },
  );
  cells.push(
    { label:"Posted Unit Cost",value:line.postedUnitCost != null?`Rs ${money(line.postedUnitCost)}`:"—" },
    { label:"Posted Value",value:line.postedValue != null?`Rs ${money(line.postedValue)}`:"—" },
    { label:"WAVG After",value:line.postedWavgAfter != null?`Rs ${money(line.postedWavgAfter)}`:"—" },
  );
  return <>{cells.map(cell => <td key={cell.label} data-label={cell.label} className="right">{cell.value}</td>)}</>;
}

function assertPostingPreview(form: ConversionForm) {
  const avalTotal = totalAvalValue(form);
  if (avalTotal <= 0 || form.avalLines.some(line => !line.hasInventoryBalance || Number(line.currentWavg ?? 0) <= 0)) throw new Error("Every AVAL line requires a current positive WAVG before posting.");
  const manualTotal = form.avinLines.reduce((sum,line) => sum + Number(line.allocationPercent || 0),0);
  if (form.allocationMethod === "MANUAL_PERCENT" && Math.abs(manualTotal-100)>0.0001) throw new Error("AVIN allocation percentages must total 100%.");
  const previews = allocationPreviews(form);
  if (!previews.length || previews.some(row => !row.valid || row.allocatedValue <= 0)) throw new Error(form.allocationMethod === "BY_EXISTING_WAVG" ? "Existing WAVG is required for every AVIN output when using BY_EXISTING_WAVG." : form.allocationMethod === "BY_WEIGHT" ? "Every AVIN output requires a positive allocation weight." : "Every AVIN output must receive a positive allocated value.");
  const total = round4(previews.reduce((sum,row) => sum + row.allocatedValue,0));
  if (total !== avalTotal) throw new Error("AVIN preview value must reconcile exactly to AVAL value.");
}
