import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import {
  inventoryAdjustmentsApi,
  type AdjustmentInput,
  type AdjustmentProductContext,
} from "../api/inventoryAdjustmentsApi";
import {
  blankAdjustmentForm,
  compatibleReason,
  defaultProductUnit,
  formFromAdjustment,
  lineBaseQuantity,
  lineCost,
  lineValue,
  money,
  movementLabel,
  quantity,
  selectedUnit,
  statusLabel,
  type AdjustmentForm,
  type AdjustmentFormLine,
} from "../inventoryAdjustmentForm";

type ScreenMode = "create" | "edit" | "view";

export function InventoryAdjustmentScreen({ mode }: { mode: ScreenMode }) {
  const auth = useAuth();
  const { id = "new" } = useParams();
  const permission =
    mode === "create"
      ? "INVENTORY_ADJUSTMENT_CREATE"
      : mode === "edit"
        ? "INVENTORY_ADJUSTMENT_UPDATE"
        : "INVENTORY_ADJUSTMENT_VIEW";
  if (!auth.permissions.includes(permission))
    return (
      <div className="card empty">
        You do not have permission to {mode} Inventory Adjustments.
      </div>
    );
  if (
    mode !== "create" &&
    (!Number.isSafeInteger(Number(id)) || Number(id) <= 0)
  )
    return <div className="card empty">Invalid Inventory Adjustment link.</div>;
  return (
    <InventoryAdjustmentFormPage
      key={`${auth.tenant?.tenantId}:${auth.tenantUser?.userId}:${mode}:${id}`}
      mode={mode}
      id={id}
    />
  );
}

function InventoryAdjustmentFormPage({
  mode,
  id,
}: {
  mode: ScreenMode;
  id: string;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const client = useQueryClient();
  const returnPath = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnTo =
    returnPath && /^\/inventory\/adjustments(?:\?|$)/.test(returnPath)
      ? returnPath
      : "/inventory/adjustments";
  const storageKey = `inventory-adjustment-form:${auth.tenant?.tenantId}:${auth.tenantUser?.userId}:${mode}:${id}`;
  const adjustment = useQuery({
    queryKey: ["inventory-adjustments", auth.tenant?.tenantId, id],
    queryFn: () => inventoryAdjustmentsApi.get(Number(id)),
    enabled: mode !== "create",
  });
  const reasons = useQuery({
    queryKey: ["inventory-adjustment-reasons", auth.tenant?.tenantId, "active"],
    queryFn: () => inventoryAdjustmentsApi.reasons({ active: true }),
  });
  const locations = useQuery({
    queryKey: [
      "inventory-adjustment-locations",
      auth.tenant?.tenantId,
      auth.tenantUser?.userId,
    ],
    queryFn: inventoryAdjustmentsApi.locations,
  });
  const [form, setForm] = useState<AdjustmentForm>(() =>
    blankAdjustmentForm(
      auth.accessScope === "LOCATION"
        ? String(auth.currentLocationId ?? "")
        : "",
    ),
  );
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeResult, setActiveResult] = useState(-1);
  const [postOpen, setPostOpen] = useState(false);
  const [negativeOpen, setNegativeOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const initialized = useRef(false);
  const suppressStorage = useRef(false);
  const postingId = useRef<number | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const unitInputs = useRef<Record<string, HTMLSelectElement | null>>({});
  const quantityInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const rowInputs = useRef<Record<number, HTMLTableRowElement | null>>({});
  const editable =
    mode !== "view" &&
    (mode === "create" || adjustment.data?.status === "DRAFT");

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);
  const searchResults = useQuery({
    queryKey: [
      "inventory-adjustment-products",
      auth.tenant?.tenantId,
      form.locationId,
      debouncedSearch,
    ],
    queryFn: () =>
      inventoryAdjustmentsApi.productContexts({
        locationId: Number(form.locationId),
        search: debouncedSearch,
      }),
    enabled:
      editable && Number(form.locationId) > 0 && Boolean(debouncedSearch),
  });
  const results = searchResults.data?.items ?? [];
  useEffect(() => setActiveResult(-1), [debouncedSearch, form.locationId]);

  useEffect(() => {
    if (initialized.current) return;
    if (mode === "create") {
      initialized.current = true;
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as { form?: AdjustmentForm };
          if (parsed.form) {
            setForm(parsed.form);
            setDirty(true);
            setRestored(true);
          }
        }
      } catch {
        /* A fresh form remains usable without storage. */
      }
      setReady(true);
      return;
    }
    if (!adjustment.data) return;
    initialized.current = true;
    void (async () => {
      const contextPairs =
        adjustment.data!.status === "POSTED"
          ? []
          : await Promise.all(
              (adjustment.data?.lines ?? []).map(async (line) => {
                try {
                  const page = await inventoryAdjustmentsApi.productContexts({
                    locationId: Number(adjustment.data!.locationId),
                    productId: Number(line.productId),
                    limit: 20,
                  });
                  return [Number(line.productId), page.items[0]] as const;
                } catch {
                  return [Number(line.productId), undefined] as const;
                }
              }),
            );
      const contexts = new Map<number, AdjustmentProductContext>(
        contextPairs.filter(
          (pair): pair is readonly [number, AdjustmentProductContext] =>
            Boolean(pair[1]),
        ),
      );
      let next = formFromAdjustment(adjustment.data!, contexts);
      if (editable) {
        try {
          const raw = sessionStorage.getItem(storageKey);
          if (raw) {
            const parsed = JSON.parse(raw) as { form?: AdjustmentForm };
            if (parsed.form) {
              next = parsed.form;
              setDirty(true);
              setRestored(true);
            }
          }
        } catch {
          /* Use the server draft. */
        }
      }
      setForm(next);
      setReady(true);
    })();
  }, [adjustment.data, editable, mode, storageKey]);

  useEffect(() => {
    if (!ready || !editable || !dirty || suppressStorage.current) return;
    const timer = window.setTimeout(() => {
      try {
        sessionStorage.setItem(
          storageKey,
          JSON.stringify({ version: 1, form }),
        );
      } catch {
        /* URL navigation still works. */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [dirty, editable, form, ready, storageKey]);

  const activeLocations = (locations.data ?? []).filter(
    (item) =>
      item.isActive &&
      (auth.accessScope !== "LOCATION" ||
        auth.assignedLocations.some(
          (assigned) => String(assigned.locationId) === String(item.locationId),
        )),
  );
  const compatibleReasons = (reasons.data ?? []).filter((reason) =>
    compatibleReason(reason, form.movementType),
  );
  const selectedReason =
    (reasons.data ?? []).find(
      (reason) => String(reason.inventoryAdjustmentReasonId) === form.reasonId,
    ) ?? adjustment.data?.reason;
  const policy = selectedReason?.costingPolicy ?? "CURRENT_WAVG";
  const status = adjustment.data?.status ?? "DRAFT";
  const posted = status === "POSTED";
  const clearDraft = () => {
    suppressStorage.current = true;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* Storage is optional. */
    }
  };
  const change = (next: AdjustmentForm) => {
    setForm(next);
    setDirty(true);
    setError("");
  };
  const changeHeader = (patch: Partial<AdjustmentForm>) => {
    let next = { ...form, ...patch };
    if (patch.movementType) {
      const currentReason = (reasons.data ?? []).find(
        (reason) =>
          String(reason.inventoryAdjustmentReasonId) === next.reasonId,
      );
      if (currentReason && !compatibleReason(currentReason, patch.movementType))
        next = { ...next, reasonId: "" };
    }
    if (
      patch.locationId !== undefined &&
      patch.locationId !== form.locationId &&
      form.lines.length
    ) {
      next = { ...next, lines: [] };
    }
    change(next);
    if (
      patch.locationId !== undefined &&
      patch.locationId !== form.locationId &&
      form.lines.length
    )
      setError(
        "Product lines were cleared because current stock and WAVG are location-specific.",
      );
  };
  const changeLine = (index: number, patch: Partial<AdjustmentFormLine>) =>
    change({
      ...form,
      lines: form.lines.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    });
  const addProduct = (product: AdjustmentProductContext) => {
    const existing = form.lines.find(
      (line) => line.productId === product.productId,
    );
    if (existing) {
      setError(
        "This product is already added. A product can appear only once per adjustment.",
      );
      rowInputs.current[existing.productId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      quantityInputs.current[existing.key]?.focus();
      setSearchOpen(false);
      setActiveResult(-1);
      return;
    }
    if (!product.productUnits.length) {
      setError("This product has no active ProductUnit.");
      return;
    }
    const key = `new-${Date.now()}-${product.productId}`;
    const defaultUnit = defaultProductUnit(product);
    const line: AdjustmentFormLine = {
      key,
      productId: product.productId,
      sku: product.sku,
      productName: product.productName,
      baseUnitLabel: product.baseUnit.symbol ?? product.baseUnit.code,
      productUnits: product.productUnits,
      productUnitId: defaultUnit ? String(defaultUnit.productUnitId) : "",
      quantity: "",
      currentStock: product.quantityOnHand,
      currentWavg: product.averageCost,
      hasInventoryBalance: product.hasInventoryBalance,
      unitCost: "",
      remarks: "",
    };
    change({ ...form, lines: [...form.lines, line] });
    setSearch("");
    setDebouncedSearch("");
    setSearchOpen(false);
    setActiveResult(-1);
    window.setTimeout(
      () =>
        defaultUnit
          ? quantityInputs.current[key]?.focus()
          : unitInputs.current[key]?.focus(),
      0,
    );
  };
  const productSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setSearchOpen(false);
      setActiveResult(-1);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSearchOpen(true);
      if (results.length)
        setActiveResult((current) =>
          Math.min(current < 0 ? 0 : current + 1, results.length - 1),
        );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (results.length)
        setActiveResult((current) => (current <= 0 ? 0 : current - 1));
      return;
    }
    if (event.key === "Enter" && searchOpen) {
      event.preventDefault();
      const selected =
        activeResult >= 0
          ? results[activeResult]
          : results.length === 1
            ? results[0]
            : undefined;
      if (selected) addProduct(selected);
    }
  };

  function payload(): AdjustmentInput {
    if (!Number(form.locationId))
      throw new Error("Select an active, assigned location.");
    const reason = (reasons.data ?? []).find(
      (item) => String(item.inventoryAdjustmentReasonId) === form.reasonId,
    );
    if (!reason || !compatibleReason(reason, form.movementType))
      throw new Error(
        "Select an active reason valid for this movement direction.",
      );
    if (reason.requiresRemarks && !form.remarks.trim())
      throw new Error(
        "Remarks are required for the selected adjustment reason.",
      );
    if (!form.lines.length) throw new Error("Add at least one product line.");
    return {
      locationId: Number(form.locationId),
      movementType: form.movementType,
      reasonId: Number(form.reasonId),
      referenceNumber: form.referenceNumber.trim() || undefined,
      remarks: form.remarks.trim() || undefined,
      lines: form.lines.map((line) => {
        if (!line.productUnitId || !selectedUnit(line))
          throw new Error(`Select an active unit for ${line.productName}.`);
        if (!line.quantity || Number(line.quantity) <= 0)
          throw new Error(
            `Quantity for ${line.productName} must be greater than zero.`,
          );
        if (reason.costingPolicy === "MANUAL_REQUIRED" && line.unitCost === "")
          throw new Error(
            `Enter a manual base-unit cost for ${line.productName}.`,
          );
        if (line.unitCost !== "" && Number(line.unitCost) < 0)
          throw new Error(
            `Unit cost for ${line.productName} cannot be negative.`,
          );
        return {
          productId: line.productId,
          productUnitId: Number(line.productUnitId),
          quantity: line.quantity,
          ...(reason.costingPolicy === "MANUAL_REQUIRED"
            ? { unitCost: line.unitCost }
            : {}),
          remarks: line.remarks.trim() || undefined,
        };
      }),
    };
  }
  const persist = async () => {
    if (!editable && mode === "view") return Number(id);
    const data = payload();
    if (postingId.current) {
      await inventoryAdjustmentsApi.update(postingId.current, data);
      return postingId.current;
    }
    if (mode === "create") {
      const created = await inventoryAdjustmentsApi.create(data);
      return Number(created.inventoryAdjustmentId);
    }
    await inventoryAdjustmentsApi.update(Number(id), data);
    return Number(id);
  };
  const save = useMutation({
    mutationFn: persist,
    onSuccess: async () => {
      clearDraft();
      setDirty(false);
      await client.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      navigate(returnTo);
    },
    onError: (failure: Error) => setError(failure.message),
  });
  const post = useMutation({
    mutationFn: async (confirmNegativeStock: boolean) => {
      const adjustmentId = postingId.current ?? (await persist());
      postingId.current = adjustmentId;
      return {
        adjustmentId,
        posted: await inventoryAdjustmentsApi.post(
          adjustmentId,
          confirmNegativeStock,
        ),
      };
    },
    onSuccess: async (result) => {
      clearDraft();
      setDirty(false);
      setPostOpen(false);
      setNegativeOpen(false);
      await client.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      navigate(`/inventory/adjustments/${result.adjustmentId}`, {
        replace: mode === "edit",
        state: { returnTo },
      });
    },
    onError: (failure: Error) => {
      if (/negative stock/i.test(failure.message)) {
        setPostOpen(false);
        setNegativeOpen(true);
        setError("");
      } else setError(failure.message);
    },
  });
  const cancel = useMutation({
    mutationFn: () => inventoryAdjustmentsApi.cancel(Number(id)),
    onSuccess: async () => {
      clearDraft();
      setCancelOpen(false);
      await client.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      await client.invalidateQueries({
        queryKey: ["inventory-adjustments", auth.tenant?.tenantId, id],
      });
      navigate(`/inventory/adjustments/${id}`, {
        replace: true,
        state: { returnTo },
      });
    },
    onError: (failure: Error) => setError(failure.message),
  });

  if (mode !== "create" && adjustment.isError)
    return (
      <div className="card empty" role="alert">
        {adjustment.error.message}{" "}
        <button
          className="btn btn-secondary"
          onClick={() => void adjustment.refetch()}
        >
          Retry
        </button>
      </div>
    );
  if (!ready || reasons.isLoading || locations.isLoading)
    return <div className="card empty">Loading Inventory Adjustment…</div>;
  const reasonError = reasons.error ?? locations.error;
  const totalBase = form.lines.reduce(
    (sum, line) =>
      sum +
      (posted && line.postedBaseQuantity != null
        ? Number(line.postedBaseQuantity)
        : lineBaseQuantity(line)),
    0,
  );
  const totalEntered = form.lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0),
    0,
  );
  const totalValue = form.lines.reduce((sum, line) => {
    if (!editable && line.postedInventoryValue != null)
      return (
        sum +
        (form.movementType === "ADJO" ? -1 : 1) *
          Math.abs(Number(line.postedInventoryValue))
      );
    return sum + lineValue(line, policy, form.movementType);
  }, 0);
  const isOpening = selectedReason?.code === "OPENING_INVENTORY";
  const mayPostOpening =
    !isOpening || auth.permissions.includes("INVENTORY_OPENING_POST");
  const canPost =
    status === "DRAFT" &&
    auth.permissions.includes("INVENTORY_ADJUSTMENT_POST") &&
    mayPostOpening &&
    !selectedReason?.requiresApproval;
  const busy = save.isPending || post.isPending || cancel.isPending;
  const title =
    mode === "create"
      ? "Create Inventory Adjustment"
      : `${mode === "view" ? "View" : "Edit"} Inventory Adjustment — ${adjustment.data?.adjustmentNumber ?? `Draft #${id}`}`;

  return (
    <div className="direct-grn-page adjustment-page inventory-adjustments-page">
      <header className="page-head direct-grn-head">
        <div>
          <div className="direct-grn-title-row">
            <h1>{title}</h1>
            <span className="grn-status-badge">{statusLabel(status)}</span>
          </div>
          <div className="direct-grn-breadcrumb">
            Inventory /{" "}
            <button type="button" onClick={() => navigate(returnTo)}>
              Inventory Adjustments
            </button>{" "}
            / {mode === "create" ? "Create" : mode === "edit" ? "Edit" : "View"}
          </div>
        </div>
      </header>
      {restored && editable && (
        <p className="grn-restored-message" role="status">
          Your unsaved Inventory Adjustment draft has been restored.
        </p>
      )}
      {mode === "edit" && !editable && (
        <p className="grn-restored-message">
          This adjustment is {statusLabel(status)} and is read-only.
        </p>
      )}
      {reasonError && (
        <p className="error" role="alert">
          Adjustment configuration could not be loaded: {reasonError.message}
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (editable && !busy) save.mutate();
        }}
      >
        <fieldset disabled={busy} className="po-fieldset">
          <div className="direct-grn-layout">
            <main className="direct-grn-main">
              <section className="direct-grn-card">
                <h2>Adjustment Details</h2>
                <div className="adjustment-header-fields">
                  <label className="field">
                    <span>Adjustment No</span>
                    <input
                      className="control"
                      readOnly
                      value={
                        adjustment.data?.adjustmentNumber ??
                        "Generated when posted"
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Adjustment Date</span>
                    <input
                      className="control"
                      readOnly
                      value={
                        adjustment.data?.adjustmentDate?.slice(0, 10) ??
                        "Assigned by backend on save"
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Location *</span>
                    <select
                      className="control"
                      disabled={
                        !editable || (mode === "edit" && status !== "DRAFT")
                      }
                      value={form.locationId}
                      onChange={(event) =>
                        changeHeader({ locationId: event.target.value })
                      }
                    >
                      <option value="">Select location</option>
                      {activeLocations.map((item) => (
                        <option key={item.locationId} value={item.locationId}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Movement Type *</span>
                    <select
                      className="control"
                      disabled={!editable}
                      value={form.movementType}
                      onChange={(event) =>
                        changeHeader({
                          movementType: event.target
                            .value as AdjustmentForm["movementType"],
                        })
                      }
                    >
                      <option value="ADJI">Adjustment In</option>
                      <option value="ADJO">Adjustment Out</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>Reason *</span>
                    <select
                      className="control"
                      disabled={!editable}
                      value={form.reasonId}
                      onChange={(event) =>
                        changeHeader({ reasonId: event.target.value })
                      }
                    >
                      <option value="">Select reason</option>
                      {compatibleReasons.map((reason) => (
                        <option
                          key={reason.inventoryAdjustmentReasonId}
                          value={reason.inventoryAdjustmentReasonId}
                        >
                          {reason.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Reference No</span>
                    <input
                      className="control"
                      readOnly={!editable}
                      maxLength={100}
                      value={form.referenceNumber}
                      onChange={(event) =>
                        changeHeader({ referenceNumber: event.target.value })
                      }
                    />
                  </label>
                </div>
                {selectedReason && (
                  <div className="adjustment-policy-note">
                    <strong>{selectedReason.name}</strong>
                    <span>
                      {posted
                        ? selectedReason.costingPolicy === "CURRENT_WAVG"
                          ? "Posted unit cost is the WAVG captured when this document was posted."
                          : "Posted unit cost is the manual base-unit cost captured at posting."
                        : selectedReason.costingPolicy === "CURRENT_WAVG"
                          ? "Uses current location WAVG. Cost is read-only."
                          : "Requires an explicit base-unit cost on every line."}
                    </span>
                  </div>
                )}
                {selectedReason?.requiresApproval && (
                  <p className="error" role="status">
                    This reason requires an approval workflow. Direct posting is
                    not currently available.
                  </p>
                )}
                {isOpening && !mayPostOpening && (
                  <p className="error" role="status">
                    You may save this draft, but opening inventory posting
                    requires INVENTORY_OPENING_POST.
                  </p>
                )}
              </section>
              <section className="direct-grn-card">
                <h2>Products</h2>
                {editable && (
                  <>
                    <div className="direct-product-search">
                      <span aria-hidden="true">⌕</span>
                      <input
                        ref={searchInput}
                        value={search}
                        disabled={!form.locationId}
                        placeholder={
                          form.locationId
                            ? "Search SKU or product name"
                            : "Select a location before adding products"
                        }
                        aria-label="Search SKU or product name"
                        aria-expanded={searchOpen && Boolean(search.trim())}
                        aria-controls="adjustment-product-results"
                        onFocus={() => setSearchOpen(true)}
                        onChange={(event) => {
                          setSearch(event.target.value);
                          setSearchOpen(true);
                        }}
                        onKeyDown={productSearchKeyDown}
                      />
                      {form.locationId && searchOpen && search.trim() && (
                        <div
                          id="adjustment-product-results"
                          className="direct-product-results"
                          role="listbox"
                        >
                          {searchResults.isFetching ||
                          search.trim() !== debouncedSearch ? (
                            <p className="direct-product-empty">
                              Searching products…
                            </p>
                          ) : searchResults.isError ? (
                            <p className="direct-product-empty" role="alert">
                              {searchResults.error.message}{" "}
                              <button
                                type="button"
                                onClick={() => void searchResults.refetch()}
                              >
                                Retry
                              </button>
                            </p>
                          ) : results.length ? (
                            results.map((product, index) => (
                              <button
                                type="button"
                                role="option"
                                aria-selected={index === activeResult}
                                className={
                                  index === activeResult ? "active" : ""
                                }
                                key={product.productId}
                                onMouseMove={() => setActiveResult(index)}
                                onClick={() => addProduct(product)}
                              >
                                <strong>{product.productName}</strong>
                                <span>
                                  {product.sku} ·{" "}
                                  {product.baseUnit.symbol ??
                                    product.baseUnit.code}{" "}
                                  · Stock {quantity(product.quantityOnHand)}
                                </span>
                              </button>
                            ))
                          ) : (
                            <p className="direct-product-empty">
                              No active stock products found at this location.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="direct-integration-note">
                      Use Arrow Up/Down and Enter to select. Escape closes
                      results. Inventory previews remain informational until
                      backend posting.
                    </p>
                  </>
                )}
                <div className="table-wrap">
                  <table className="adjustment-lines-table">
                    <thead>
                      <tr>
                        {(posted
                          ? [
                              "Product",
                              "Unit",
                              "Stock Before",
                              "Posted Qty",
                              "Base Qty",
                              "Stock After",
                              "Posted Unit Cost",
                              "Value Impact",
                              "Remarks",
                            ]
                          : [
                              "Product",
                              "Unit",
                              "Current Stock",
                              "Current WAVG",
                              "Qty",
                              "Base Qty",
                              "Resulting Stock",
                              "Unit Cost",
                              "Value Impact",
                              "Remarks",
                              ...(editable ? ["Remove"] : []),
                            ]
                        ).map((label) => (
                          <th key={label}>{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {!form.lines.length ? (
                        <tr>
                          <td
                            colSpan={posted ? 9 : editable ? 11 : 10}
                            className="direct-lines-empty"
                          >
                            No products added yet.
                          </td>
                        </tr>
                      ) : (
                        form.lines.map((line, index) => {
                          const baseQty =
                            line.postedBaseQuantity && !editable
                              ? Number(line.postedBaseQuantity)
                              : lineBaseQuantity(line);
                          const resulting =
                            Number(line.currentStock || 0) +
                            (form.movementType === "ADJI" ? baseQty : -baseQty);
                          const effectiveCost =
                            !editable && line.unitCost !== ""
                              ? Number(line.unitCost)
                              : lineCost(line, policy);
                          const impact =
                            line.postedInventoryValue != null && !editable
                              ? (form.movementType === "ADJO" ? -1 : 1) *
                                Math.abs(Number(line.postedInventoryValue))
                              : (form.movementType === "ADJO" ? -1 : 1) *
                                baseQty *
                                effectiveCost;
                          const wavgUnavailable =
                            !posted &&
                            policy === "CURRENT_WAVG" &&
                            form.movementType === "ADJI" &&
                            (!line.hasInventoryBalance ||
                              Number(line.currentWavg ?? 0) <= 0);
                          return (
                            <tr
                              key={line.key}
                              ref={(element) => {
                                rowInputs.current[line.productId] = element;
                              }}
                            >
                              <td data-label="Product">
                                <div className="direct-product-cell">
                                  <strong>{line.productName}</strong>
                                  <span>{line.sku}</span>
                                  {wavgUnavailable && (
                                    <small className="error">
                                      Current WAVG unavailable; posting will be
                                      rejected. Choose a manual-cost reason.
                                    </small>
                                  )}
                                </div>
                              </td>
                              <td data-label="Unit">
                                {editable ? (
                                  <select
                                    ref={(element) => {
                                      unitInputs.current[line.key] = element;
                                    }}
                                    className="control"
                                    aria-label={`Unit for ${line.productName}`}
                                    required
                                    value={line.productUnitId}
                                    onChange={(event) =>
                                      changeLine(index, {
                                        productUnitId: event.target.value,
                                      })
                                    }
                                  >
                                    <option value="">Select unit</option>
                                    {line.productUnits.map((unit) => (
                                      <option
                                        key={unit.productUnitId}
                                        value={unit.productUnitId}
                                      >
                                        {unit.unit.name} (×
                                        {unit.conversionFactor})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  (selectedUnit(line)?.unit.name ?? "—")
                                )}
                              </td>
                              {posted ? (
                                <>
                                  <td
                                    data-label="Stock Before"
                                    className="right"
                                  >
                                    {line.postedQuantityBefore != null
                                      ? `${quantity(line.postedQuantityBefore)} ${line.baseUnitLabel}`
                                      : "—"}
                                  </td>
                                  <td data-label="Posted Qty" className="right">
                                    {quantity(line.quantity)}
                                  </td>
                                  <td data-label="Base Qty" className="right">
                                    {quantity(baseQty)} {line.baseUnitLabel}
                                  </td>
                                  <td
                                    data-label="Stock After"
                                    className={`right${Number(line.postedQuantityAfter ?? 0) < 0 ? " error" : ""}`}
                                  >
                                    {line.postedQuantityAfter != null
                                      ? `${quantity(line.postedQuantityAfter)} ${line.baseUnitLabel}`
                                      : "—"}
                                  </td>
                                  <td data-label="Posted Unit Cost">
                                    {line.unitCost !== ""
                                      ? `Rs ${money(line.unitCost)}`
                                      : "—"}
                                  </td>
                                  <td
                                    data-label="Value Impact"
                                    className="right"
                                  >
                                    {impact >= 0 ? "+" : "−"} Rs{" "}
                                    {money(Math.abs(impact))}
                                  </td>
                                  <td data-label="Remarks">
                                    {line.remarks || "—"}
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td
                                    data-label="Current Stock"
                                    className="right"
                                  >
                                    {quantity(line.currentStock)}{" "}
                                    {line.baseUnitLabel}
                                  </td>
                                  <td
                                    data-label="Current WAVG"
                                    className="right"
                                  >
                                    {line.currentWavg != null
                                      ? `Rs ${money(line.currentWavg)}`
                                      : "—"}
                                  </td>
                                  <td data-label="Qty">
                                    {editable ? (
                                      <input
                                        ref={(element) => {
                                          quantityInputs.current[line.key] =
                                            element;
                                        }}
                                        className="control"
                                        aria-label={`Quantity for ${line.productName}`}
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        required
                                        value={line.quantity}
                                        onChange={(event) =>
                                          changeLine(index, {
                                            quantity: event.target.value,
                                          })
                                        }
                                        onKeyDown={(event) => {
                                          if (event.key === "Enter") {
                                            event.preventDefault();
                                            searchInput.current?.focus();
                                            setSearchOpen(true);
                                          }
                                        }}
                                      />
                                    ) : (
                                      quantity(line.quantity)
                                    )}
                                  </td>
                                  <td data-label="Base Qty" className="right">
                                    {quantity(baseQty)} {line.baseUnitLabel}
                                  </td>
                                  <td
                                    data-label="Resulting Stock"
                                    className={`right${resulting < 0 ? " error" : ""}`}
                                  >
                                    {quantity(resulting)} {line.baseUnitLabel}
                                  </td>
                                  <td data-label="Unit Cost">
                                    {policy === "MANUAL_REQUIRED" &&
                                    editable ? (
                                      <input
                                        className="control"
                                        aria-label={`Manual base-unit cost for ${line.productName}`}
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        required
                                        value={line.unitCost}
                                        onChange={(event) =>
                                          changeLine(index, {
                                            unitCost: event.target.value,
                                          })
                                        }
                                      />
                                    ) : line.unitCost !== "" ||
                                      line.currentWavg != null ? (
                                      `Rs ${money(effectiveCost)}`
                                    ) : (
                                      "—"
                                    )}
                                  </td>
                                  <td
                                    data-label="Value Impact"
                                    className="right"
                                  >
                                    {impact >= 0 ? "+" : "−"} Rs{" "}
                                    {money(Math.abs(impact))}
                                  </td>
                                  <td data-label="Remarks">
                                    {editable ? (
                                      <input
                                        className="control"
                                        maxLength={2000}
                                        value={line.remarks}
                                        onChange={(event) =>
                                          changeLine(index, {
                                            remarks: event.target.value,
                                          })
                                        }
                                      />
                                    ) : (
                                      line.remarks || "—"
                                    )}
                                  </td>
                                </>
                              )}
                              {editable && (
                                <td data-label="Remove">
                                  <button
                                    type="button"
                                    className="icon-btn"
                                    aria-label={`Remove ${line.productName}`}
                                    onClick={() =>
                                      change({
                                        ...form,
                                        lines: form.lines.filter(
                                          (_, lineIndex) => lineIndex !== index,
                                        ),
                                      })
                                    }
                                  >
                                    ×
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                {editable && (
                  <button
                    type="button"
                    className="direct-add-product"
                    disabled={!form.locationId}
                    onClick={() => {
                      searchInput.current?.focus();
                      setSearchOpen(true);
                    }}
                  >
                    + Add product
                  </button>
                )}
              </section>
              <section className="direct-grn-card">
                <h2>Remarks</h2>
                <label className="field">
                  <span>
                    Adjustment remarks
                    {selectedReason?.requiresRemarks ? " *" : ""}
                  </span>
                  <textarea
                    className="control"
                    rows={4}
                    readOnly={!editable}
                    required={selectedReason?.requiresRemarks}
                    value={form.remarks}
                    onChange={(event) =>
                      changeHeader({ remarks: event.target.value })
                    }
                    placeholder={
                      selectedReason?.requiresRemarks
                        ? "Required for this reason"
                        : "Optional adjustment remarks"
                    }
                  />
                </label>
              </section>
            </main>
            <aside
              className="direct-summary-card"
              aria-label="Inventory Adjustment summary"
            >
              <h2>Adjustment Summary</h2>
              <div>
                <span>Movement</span>
                <b>{movementLabel(form.movementType)}</b>
              </div>
              <div>
                <span>Total lines</span>
                <b>{form.lines.length}</b>
              </div>
              <div>
                <span>Total entered qty</span>
                <b>{quantity(totalEntered)}</b>
              </div>
              <div>
                <span>Total base qty</span>
                <b>{quantity(totalBase)}</b>
              </div>
              <hr />
              <strong>
                {posted
                  ? "Posted Inventory Value Impact"
                  : "Estimated Inventory Value Impact"}
              </strong>
              <b className={totalValue < 0 ? "error" : ""}>
                {totalValue >= 0 ? "+" : "−"} Rs {money(Math.abs(totalValue))}
              </b>
              <p className="direct-integration-note">
                {posted
                  ? "Posted quantities, unit costs, and values are immutable posting snapshots."
                  : "Estimate only. Backend stock, WAVG, and conversion validation is authoritative at posting."}
              </p>
            </aside>
          </div>
          <footer className="direct-grn-actions">
            {error && (
              <p className="direct-grn-error error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() =>
                editable && dirty ? setDiscardOpen(true) : navigate(returnTo)
              }
            >
              {editable ? "Back" : "Back to list"}
            </button>
            {mode === "view" &&
              status === "DRAFT" &&
              auth.permissions.includes("INVENTORY_ADJUSTMENT_UPDATE") && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() =>
                    navigate(`/inventory/adjustments/${id}/edit`, {
                      state: { returnTo },
                    })
                  }
                >
                  Edit
                </button>
              )}
            {editable && (
              <button
                type="submit"
                className="btn btn-secondary direct-save-draft"
                disabled={busy}
              >
                {save.isPending ? "Saving…" : "Save Draft"}
              </button>
            )}
            {canPost && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() => {
                  try {
                    payload();
                    setError("");
                    setPostOpen(true);
                  } catch (failure) {
                    setError((failure as Error).message);
                  }
                }}
              >
                Post Adjustment
              </button>
            )}
            {mode !== "create" &&
              status === "DRAFT" &&
              auth.permissions.includes("INVENTORY_ADJUSTMENT_CANCEL") && (
                <button
                  type="button"
                  className="btn btn-danger-soft"
                  disabled={busy}
                  onClick={() => setCancelOpen(true)}
                >
                  Cancel Draft
                </button>
              )}
          </footer>
        </fieldset>
      </form>
      <Modal
        open={discardOpen}
        title="Discard unsaved Inventory Adjustment changes?"
        onClose={() => setDiscardOpen(false)}
      >
        <div className="modal-body">
          <p>Your unsaved browser draft will be removed.</p>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={() => setDiscardOpen(false)}
          >
            Keep editing
          </button>
          <button
            className="btn btn-danger-soft"
            onClick={() => {
              clearDraft();
              navigate(returnTo);
            }}
          >
            Discard
          </button>
        </div>
      </Modal>
      <Modal
        open={postOpen}
        title="Post this Inventory Adjustment?"
        onClose={() => !post.isPending && setPostOpen(false)}
      >
        <div className="modal-body">
          <p>
            Latest draft changes will be saved first. Posting updates inventory
            and cannot be edited afterward.
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={post.isPending}
            onClick={() => setPostOpen(false)}
          >
            Keep as draft
          </button>
          <button
            className="btn btn-primary"
            disabled={post.isPending}
            onClick={() => post.mutate(false)}
          >
            {post.isPending ? "Posting…" : "Post Adjustment"}
          </button>
        </div>
      </Modal>
      <Modal
        open={negativeOpen}
        title="Negative stock confirmation"
        onClose={() => !post.isPending && setNegativeOpen(false)}
      >
        <div className="modal-body">
          <p>
            This adjustment will cause negative stock for one or more products.
            Do you want to continue?
          </p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={post.isPending}
            onClick={() => setNegativeOpen(false)}
          >
            Cancel
          </button>
          <button
            className="btn btn-danger-soft"
            disabled={post.isPending}
            onClick={() => post.mutate(true)}
          >
            {post.isPending ? "Posting…" : "Post Anyway"}
          </button>
        </div>
      </Modal>
      <Modal
        open={cancelOpen}
        title="Cancel this draft Inventory Adjustment?"
        onClose={() => !cancel.isPending && setCancelOpen(false)}
      >
        <div className="modal-body">
          <p>The document remains visible for audit and becomes read-only.</p>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={cancel.isPending}
            onClick={() => setCancelOpen(false)}
          >
            Keep draft
          </button>
          <button
            className="btn btn-danger-soft"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel Adjustment"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
