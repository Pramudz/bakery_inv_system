import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { useAuth } from "../../auth/AuthContext";
import { locationsApi } from "../../locations/api/locationsApi";
import { productsApi, type Product } from "../../products/api/productsApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { purchasingApi } from "../api/purchasingApi";
import { purchaseUnits, usePurchasingProductSearch } from "../purchasingProducts";
import { addCalendarDays, blankPoForm, eligibleProduct, formFromOrder, lineTotal, money, numberValue, overrideRequired, poNumber, poPayload, poTotals, readPoDraft, refreshPoLine, requiredId, statusLabel, type PoForm, type PoLine, type PurchaseOrderMode } from "../purchaseOrderForm";

export function PurchaseOrderScreen({ mode }: { mode: PurchaseOrderMode }) {
  const { tenant, tenantUser, permissions } = useAuth();
  const { id = "new" } = useParams();
  const permission = mode === "create" ? "PURCHASE_ORDER_CREATE" : mode === "edit" ? "PURCHASE_ORDER_UPDATE" : "PURCHASE_ORDER_VIEW";
  if (!permissions.includes(permission)) return <div className="card empty">You do not have permission to {mode} Purchase Orders.</div>;
  if (mode !== "create" && (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)) return <div className="card empty">Invalid Purchase Order link.</div>;
  return <PurchaseOrderFormPage key={`${tenant?.tenantId}:${tenantUser?.userId}:${mode}:${id}`} mode={mode} id={id} />;
}

function PurchaseOrderFormPage({ mode, id }: { mode: PurchaseOrderMode; id: string }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const returnPath = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnTo = returnPath && /^\/purchase-orders(?:\?|$)/.test(returnPath) ? returnPath : "/purchase-orders";
  const storageKey = `po-form-draft:${auth.tenant?.tenantId}:${auth.tenantUser?.userId}:${mode}:${id}`;
  const order = useQuery({ queryKey: ["purchase-orders", auth.tenant?.tenantId, id], queryFn: () => purchasingApi.getOrder(requiredId(id, "Purchase Order")), enabled: mode !== "create" });
  const editable = mode !== "view" && (mode === "create" || order.data?.status === "DRAFT");
  const suppliers = useQuery({ queryKey: ["suppliers", auth.tenant?.tenantId], queryFn: suppliersApi.list, enabled: editable });
  const locations = useQuery({ queryKey: ["locations", auth.tenant?.tenantId], queryFn: locationsApi.list, enabled: editable });
  const products = useQuery({ queryKey: ["products", auth.tenant?.tenantId, "purchasing"], queryFn: productsApi.list, enabled: editable });
  const availability = useQuery({ queryKey: ["product-locations", auth.tenant?.tenantId], queryFn: productsApi.locations, enabled: editable });
  const [form, setForm] = useState<PoForm>(() => blankPoForm(auth.tenant?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, auth.accessScope === "LOCATION" ? String(auth.currentLocationId ?? "") : ""));
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const initialized = useRef(false);
  const suppressStorage = useRef(false);
  const deliveryChanged = useRef(false);
  const latest = useRef({ form, ready, dirty, editable });
  latest.current = { form, ready, dirty, editable };

  useEffect(() => {
    if (initialized.current || (mode !== "create" && !order.data)) return;
    initialized.current = true;
    let restoredForm: PoForm | undefined;
    if (editable) {
      try { restoredForm = readPoDraft(sessionStorage, storageKey, mode, id); }
      catch { setStorageWarning("Browser storage is unavailable. Keep this page open until you save."); }
    }
    if (restoredForm) {
      setForm(restoredForm); setDirty(true); setRestored(true); deliveryChanged.current = Boolean(restoredForm.expectedDeliveryDate);
    } else if (order.data) { setForm(formFromOrder(order.data)); deliveryChanged.current = true; }
    setReady(true);
  }, [editable, id, mode, order.data, storageKey]);

  useEffect(() => {
    if (!ready || !editable || !products.data) return;
    // Refresh source eligibility while retaining saved/restored costs and conversion-unit choices.
    setForm(current => {
      const lines = current.lines.map(line => {
        const refreshed = refreshPoLine(line, current, products.data!, true);
        return { ...refreshed, manualCost: overrideRequired(refreshed) || Boolean(line.costOverrideReason) };
      });
      return JSON.stringify(lines) === JSON.stringify(current.lines) ? current : { ...current, lines };
    });
  }, [ready, editable, products.data]);

  useEffect(() => {
    if (!ready || !dirty || !editable) return;
    const timer = window.setTimeout(() => {
      if (suppressStorage.current) return;
      try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: Date.now(), mode, poId: id, form })); }
      catch { setStorageWarning("Browser storage is unavailable. Keep this page open until you save."); }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [dirty, editable, form, id, mode, ready, storageKey]);

  useEffect(() => {
    const flush = () => {
      const current = latest.current;
      if (suppressStorage.current || !current.ready || !current.dirty || !current.editable) return;
      try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 1, savedAt: Date.now(), mode, poId: id, form: current.form })); } catch { /* Navigation must still work when storage is blocked. */ }
    };
    window.addEventListener("pagehide", flush);
    return () => { window.removeEventListener("pagehide", flush); flush(); };
  }, [id, mode, storageKey]);

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const searchEnabled = editable && Boolean(form.supplierId && form.locationId);
  const productSearch = usePurchasingProductSearch(debouncedSearch, searchEnabled, `po-search:${auth.tenant?.tenantId}`);
  const activeSuppliers = (suppliers.data ?? []).filter(supplier => supplier.isActive);
  const activeLocations = (locations.data ?? []).filter(item => item.isActive && (auth.accessScope !== "LOCATION" || auth.assignedLocations.some(assigned => String(assigned.locationId) === String(item.locationId))));
  const productData = products.data ?? [];
  const availableData = availability.data ?? [];
  const results = (productSearch.data?.items ?? []).map(item => productData.find(product => String(product.productId) === String(item.productId))).filter((product): product is Product => Boolean(product) && eligibleProduct(product, form, availableData));

  const change = (next: PoForm) => { setForm(next); setDirty(true); setError(""); };
  const changeHeader = (patch: Partial<PoForm>) => {
    const next = { ...form, ...patch };
    if ((patch.supplierId !== undefined || patch.orderDate !== undefined) && !deliveryChanged.current) {
      // Supplier master currently has no lead time. Use it only if actually returned by the existing API.
      const supplier = activeSuppliers.find(item => String(item.supplierId) === next.supplierId) as { leadTimeDays?: number | null } | undefined;
      next.expectedDeliveryDate = supplier?.leadTimeDays != null ? addCalendarDays(next.orderDate, Number(supplier.leadTimeDays)) : "";
    }
    next.lines = next.lines.map(line => refreshPoLine(line, next, productData));
    change(next);
  };
  const changeLine = (index: number, patch: Partial<PoLine>) => {
    const next = { ...form.lines[index], ...patch };
    if (patch.productUnitId !== undefined && form.lines.some((line, i) => i !== index && line.productId === next.productId && line.productUnitId === next.productUnitId)) { setError("This product and purchase unit are already included."); return; }
    if (patch.unitCost !== undefined) next.manualCost = next.baselineUnitCost === undefined || numberValue(patch.unitCost) !== numberValue(next.baselineUnitCost);
    const line = refreshPoLine(next, form, productData, patch.unitCost !== undefined || next.manualCost);
    change({ ...form, lines: form.lines.map((current, i) => i === index ? line : current) });
  };
  const addProduct = (product: Product) => {
    const selection = purchaseUnits(product, form.supplierId).find(item => !form.lines.some(line => line.productId === String(product.productId) && line.productUnitId === String(item.productUnit.productUnitId)));
    if (!selection) { setError("All purchase units for this product are already included."); return; }
    const line: PoLine = {
      productId: String(product.productId), productName: product.productName, sku: product.sku ?? "", productUnitId: String(selection.productUnit.productUnitId), unitId: String(selection.productUnit.unitId), unitLabel: selection.productUnit.unit?.name ?? "Unit", orderedQty: "1", unitCost: "", discountAmount: "0", taxAmount: "0", costOverrideReason: "", manualCost: false, notes: "",
    };
    change({ ...form, lines: [...form.lines, refreshPoLine(line, form, productData)] });
    setSearch(""); setDebouncedSearch(""); setSearchOpen(false); searchInput.current?.focus();
  };
  const clearDraft = () => { suppressStorage.current = true; try { sessionStorage.removeItem(storageKey); } catch { /* Browser storage may be disabled. */ } };
  const save = useMutation({
    mutationFn: async () => {
      if (!editable) throw new Error("Only draft Purchase Orders can be edited.");
      if (!products.data || !availability.data || !suppliers.data || !locations.data) throw new Error("Wait for purchasing configuration to load.");
      if (!activeSuppliers.some(item => String(item.supplierId) === form.supplierId)) throw new Error("Select an active supplier.");
      if (!activeLocations.some(item => String(item.locationId) === form.locationId)) throw new Error("Select an active, assigned receiving location.");
      const payload = poPayload(form, products.data, availability.data);
      return mode === "create" ? purchasingApi.createOrder(payload) : purchasingApi.updateOrder(requiredId(id, "Purchase Order"), payload);
    },
    onSuccess: () => { clearDraft(); setDirty(false); void client.invalidateQueries({ queryKey: ["purchase-orders"] }); navigate(returnTo); },
    onError: (failure: Error) => setError(failure.message),
  });
  const approve = useMutation({
    mutationFn: async () => {
      const purchaseOrderId = requiredId(id, "Purchase Order");
      if (mode === "create" || order.data?.status !== "DRAFT") throw new Error("Only draft Purchase Orders can be approved.");
      if (mode === "edit") {
        if (!products.data || !availability.data || !suppliers.data || !locations.data) throw new Error("Wait for purchasing configuration to load.");
        if (!activeSuppliers.some(item => String(item.supplierId) === form.supplierId)) throw new Error("Select an active supplier.");
        if (!activeLocations.some(item => String(item.locationId) === form.locationId)) throw new Error("Select an active, assigned receiving location.");
        await purchasingApi.updateOrder(purchaseOrderId, poPayload(form, products.data, availability.data));
      }
      return purchasingApi.approveOrder(purchaseOrderId);
    },
    onSuccess: async () => {
      clearDraft();
      setDirty(false);
      setApproveOpen(false);
      await client.invalidateQueries({ queryKey: ["purchase-orders"] });
      navigate(`/purchase-orders/${id}`, { replace: mode === "edit", state: { returnTo } });
    },
    onError: (failure: Error) => setError(failure.message),
  });

  if (mode !== "create" && order.isError) return <div className="card empty" role="alert">{order.error.message}<button className="btn btn-secondary" onClick={() => void order.refetch()}>Retry</button></div>;
  if (!ready) return <div className="card empty">Loading Purchase Order…</div>;
  const display = !editable && order.data ? formFromOrder(order.data) : form;
  const displayLines = Array.isArray(display.lines) ? display.lines : [];
  const status = order.data?.status ?? "DRAFT";
  const title = mode === "create" ? "Create Purchase Order" : `${mode === "view" ? "View" : "Edit"} Purchase Order — ${poNumber(order.data?.poNumber)}`;
  const totals = poTotals(displayLines);
  const currency = display.currencyCode || "LKR";
  const supplierLabel = order.data?.supplier?.supplierName ?? "Supplier unavailable";
  const locationLabel = order.data?.location?.name ?? "Receiving location unavailable";
  const configurationError = suppliers.error ?? locations.error ?? products.error ?? availability.error;
  const canApprove = mode !== "create" && status === "DRAFT" && auth.permissions.includes("PURCHASE_ORDER_APPROVE");
  const busy = save.isPending || approve.isPending;

  return <div className="direct-grn-page po-page">
    <header className="page-head direct-grn-head"><div><div className="direct-grn-title-row"><h1>{title}</h1><span className="grn-status-badge">{statusLabel(status)}</span></div><div className="direct-grn-breadcrumb">Purchasing / <button type="button" onClick={() => navigate(returnTo)}>Purchase Orders</button> / {mode === "create" ? title : `${mode === "view" ? "View" : "Edit"} Purchase Order`}</div></div></header>
    {restored && editable && <p className="grn-restored-message" role="status">Your unsaved Purchase Order draft has been restored.</p>}
    {storageWarning && <p role="status">{storageWarning}</p>}
    {mode === "edit" && !editable && <p className="grn-restored-message">This Purchase Order is {statusLabel(status)}. Only Draft Purchase Orders can be edited.</p>}
    {configurationError && editable && <p className="error" role="alert">Purchasing configuration could not be loaded: {configurationError.message} <button type="button" className="btn btn-ghost" onClick={() => { void suppliers.refetch(); void locations.refetch(); void products.refetch(); void availability.refetch(); }}>Retry</button></p>}
    <form onSubmit={event => { event.preventDefault(); if (!busy) save.mutate(); }}>
      <fieldset disabled={busy} className="po-fieldset">
        <div className="direct-grn-layout">
          <main className="direct-grn-main">
            <section className="direct-grn-card"><h2>Order Details</h2>
              {editable ? <div className="direct-grn-fields po-details-fields">
                <SearchableSelect label="Supplier" required value={form.supplierId} selectedLabel={supplierLabel} onChange={supplierId => changeHeader({ supplierId })} options={activeSuppliers.map(item => ({ value: item.supplierId, label: item.supplierName, code: item.supplierCode }))} placeholder="Search supplier" emptyMessage="No active suppliers found." />
                <SearchableSelect label="Receiving Location" required value={form.locationId} selectedLabel={locationLabel} onChange={locationId => changeHeader({ locationId })} options={activeLocations.map(item => ({ value: item.locationId, label: item.name, code: item.code }))} placeholder="Search receiving location" emptyMessage="No available locations found." />
                <label className="field"><span>Order Date *</span><input className="control" type="date" required value={form.orderDate} onChange={event => changeHeader({ orderDate: event.target.value })} /></label>
                <label className="field"><span>Expected Delivery Date *</span><input className="control" type="date" required value={form.expectedDeliveryDate} onChange={event => { deliveryChanged.current = true; change({ ...form, expectedDeliveryDate: event.target.value }); }} /></label>
                <label className="field"><span>Currency *</span><input className="control" maxLength={3} required value={form.currencyCode} onChange={event => changeHeader({ currencyCode: event.target.value.toUpperCase() })} /></label>
              </div> : <dl className="po-readonly-details"><div><dt>Supplier</dt><dd>{supplierLabel}</dd></div><div><dt>Receiving Location</dt><dd>{locationLabel}</dd></div><div><dt>Order Date</dt><dd>{display.orderDate || "—"}</dd></div><div><dt>Expected Delivery Date</dt><dd>{display.expectedDeliveryDate || "—"}</dd></div><div><dt>Currency</dt><dd>{currency}</dd></div></dl>}
            </section>
            <section className="direct-grn-card"><h2>Products</h2>
              {editable && <><div className="direct-product-search"><span aria-hidden="true">⌕</span><input ref={searchInput} value={search} disabled={!searchEnabled} placeholder="Search SKU, barcode or product" aria-label="Search SKU, barcode or product" aria-expanded={searchOpen && Boolean(search.trim())} aria-controls="po-product-results" onFocus={() => setSearchOpen(true)} onChange={event => { setSearch(event.target.value); setSearchOpen(true); }} onKeyDown={event => { if (event.key === "Escape") setSearchOpen(false); if (event.key === "Enter") event.preventDefault(); }} />
                {searchEnabled && searchOpen && search.trim() && <div id="po-product-results" className="direct-product-results">
                  {productSearch.isFetching || products.isLoading || availability.isLoading || search.trim() !== debouncedSearch ? <p className="direct-product-empty">Searching products…</p> : productSearch.isError ? <p className="direct-product-empty" role="alert">Product search failed. <button type="button" onClick={() => void productSearch.refetch()}>Retry</button></p> : results.length ? results.map(product => <button type="button" key={product.productId} onClick={() => addProduct(product)}><strong>{product.productName}</strong><span>{product.sku}</span></button>) : <p className="direct-product-empty">No eligible products in these results. Refine your search by SKU, barcode or product name.</p>}
                </div>}
              </div><p className="direct-integration-note">{searchEnabled ? "Prices use the order date, currency and quantity tier. Discount and tax are amounts per purchase unit." : "Select a Supplier and Receiving Location before adding products."}</p></>}
              <table className="po-lines-table"><thead><tr>{["Product", "Ordered Qty", "Purchase Unit", "Unit Cost", "Cost Override Reason", "Discount", "Tax", "Line Total", ...(editable ? ["Remove"] : [])].map(label => <th key={label}>{label}</th>)}</tr></thead>
                <tbody>{!displayLines.length ? <tr><td colSpan={editable ? 9 : 8} className="direct-lines-empty">No products added yet.</td></tr> : displayLines.map((line, index) => {
                  const units = purchaseUnits(productData.find(product => String(product.productId) === line.productId), form.supplierId);
                  const invalid = editable && products.data && availability.data && (!eligibleProduct(productData.find(product => String(product.productId) === line.productId), form, availableData) || !units.some(item => String(item.productUnit.productUnitId) === line.productUnitId));
                  const numericCell = (label: string, field: "orderedQty" | "unitCost" | "discountAmount" | "taxAmount") => <td data-label={label}>{editable ? <input className="control" aria-label={`${label} for ${line.productName}`} type="number" min={field === "orderedQty" ? "0.0001" : "0"} step="0.0001" required value={line[field]} onChange={event => changeLine(index, { [field]: event.target.value })} /> : field === "orderedQty" ? line[field] : money(line[field])}</td>;
                  return <tr key={`${line.productId}:${index}`}><td data-label="Product"><div className="direct-product-cell"><strong>{line.productName}</strong><span>{line.sku}</span>{invalid && <small className="error">Unavailable for this supplier/location or unit. Change the unit or remove this line.</small>}</div></td>
                    {numericCell("Ordered Qty", "orderedQty")}
                    <td data-label="Purchase Unit">{editable ? <select className="control" aria-label={`Purchase Unit for ${line.productName}`} value={line.productUnitId} onChange={event => changeLine(index, { productUnitId: event.target.value })}>{!units.some(item => String(item.productUnit.productUnitId) === line.productUnitId) && <option value={line.productUnitId}>{line.unitLabel} (unavailable)</option>}{units.map(item => <option key={item.productUnit.productUnitId} value={String(item.productUnit.productUnitId)}>{item.productUnit.unit?.name ?? item.productUnit.unit?.code ?? "Purchase unit"}</option>)}</select> : line.unitLabel}</td>
                    {numericCell("Unit Cost", "unitCost")}
                    <td data-label="Cost Override Reason">{editable && overrideRequired(line) ? <input className="control" required maxLength={500} aria-label={`Cost Override Reason for ${line.productName}`} placeholder="Reason required" value={line.costOverrideReason} onChange={event => changeLine(index, { costOverrideReason: event.target.value })} /> : <span>{line.costOverrideReason || (editable ? "Supplier price" : "—")}</span>}</td>
                    {numericCell("Discount", "discountAmount")}{numericCell("Tax", "taxAmount")}
                    <td data-label="Line Total" className="right">{money(lineTotal(line))}</td>
                    {editable && <td data-label="Remove"><button type="button" className="icon-btn" aria-label={`Remove ${line.productName}`} onClick={() => change({ ...form, lines: form.lines.filter((_, i) => i !== index) })}>×</button></td>}
                  </tr>;
                })}</tbody></table>
              {editable && <button type="button" className="direct-add-product" disabled={!searchEnabled} onClick={() => { searchInput.current?.focus(); setSearchOpen(true); }}>+ Add product</button>}
            </section>
            <section className="direct-grn-card"><h2>Notes &amp; Documents</h2>{editable ? <label className="field"><span>Purchase notes</span><textarea className="control" rows={4} value={form.notes} placeholder="Optional purchase notes" onChange={event => change({ ...form, notes: event.target.value })} /></label> : <p className="po-notes">{display.notes || "No purchase notes."}</p>}</section>
          </main>
          <aside className="direct-summary-card" aria-label="Purchase Order summary"><h2>Order Summary</h2><div><span>Number of lines</span><b>{displayLines.length}</b></div><div><span>Total units ordered</span><b>{totals.units.toLocaleString("en-LK", { maximumFractionDigits: 4 })}</b></div><hr /><div><span>Subtotal</span><b>{money(totals.subtotal)}</b></div><div><span>Discount total</span><b>{money(totals.discount)}</b></div><div><span>Tax total</span><b>{money(totals.tax)}</b></div><hr /><strong>Grand Total ({currency})</strong><b>{money(totals.total)}</b><p className="direct-integration-note">Purchase Orders do not update inventory.</p></aside>
        </div>
        <footer className="direct-grn-actions">{error && <p className="direct-grn-error error" role="alert">{error}</p>}<button type="button" className="btn btn-secondary" onClick={() => editable && dirty ? setDiscardOpen(true) : navigate(returnTo)}>{editable ? "Cancel" : "Back"}</button>{mode === "view" && status === "DRAFT" && auth.permissions.includes("PURCHASE_ORDER_UPDATE") && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => navigate(`/purchase-orders/${id}/edit`, { state: { returnTo } })}>Edit</button>}{editable && <button type="submit" className="btn btn-secondary direct-save-draft" disabled={busy || Boolean(configurationError) || !products.data || !availability.data}>{save.isPending ? "Saving…" : "Save Draft"}</button>}{canApprove && <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { setError(""); setApproveOpen(true); }}>Approve PO</button>}</footer>
      </fieldset>
    </form>
    <Modal open={discardOpen} title="Discard this unsaved Purchase Order draft?" onClose={() => setDiscardOpen(false)}><div className="modal-body"><p>Your unsaved changes will be removed from this browser session.</p></div><div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => setDiscardOpen(false)}>Keep editing</button><button type="button" className="btn btn-danger-soft" onClick={() => { clearDraft(); navigate(returnTo); }}>Discard draft</button></div></Modal>
    <Modal open={approveOpen} title="Approve this Purchase Order? Once approved, it cannot be edited and can be used for PO-based receiving." onClose={() => { if (!approve.isPending) setApproveOpen(false); }}><div className="modal-body">{error && <p className="error" role="alert">{error}</p>}</div><div className="modal-foot"><button type="button" className="btn btn-secondary" disabled={approve.isPending} onClick={() => setApproveOpen(false)}>Keep editing</button><button type="button" className="btn btn-primary" disabled={approve.isPending} onClick={() => approve.mutate()}>{approve.isPending ? "Approving…" : "Approve PO"}</button></div></Modal>
  </div>;
}
