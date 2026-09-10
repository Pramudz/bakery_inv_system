import {
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { useAuth } from "../../auth/AuthContext";
import { locationsApi } from "../../locations/api/locationsApi";
import { productsApi } from "../../products/api/productsApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { purchaseUnits, supplierPrice, usePurchasingProductSearch } from "../purchasingProducts";
import {
  type GoodsReceipt,
  type GoodsReceiptPayload,
  type PurchaseOrder,
  purchasingApi,
} from "../api/purchasingApi";

export type GoodsReceiptMode =
  | "create-direct"
  | "create-po-based"
  | "view"
  | "edit";

type GrnLine = {
  purchaseOrderLineId?: number | string;
  productId: string;
  productName: string;
  sku: string;
  productUnitId: string;
  unitId: string;
  unitLabel: string;
  receivedQty: string;
  outstandingQty?: string;
  orderedQty?: string;
  previouslyReceivedQty?: string;
  unitCost: string;
  discountAmount: string;
  taxAmount: string;
  sourceSupplierPriceId?: number | string;
  baselineUnitCost?: string;
  costOverrideReason: string;
  batchNumber?: string;
  manufactureDate?: string;
  expiryDate?: string;
};

type GrnForm = {
  receiptType: "DIRECT" | "PO_BASED";
  purchaseOrderId: string;
  poNumber: string;
  supplierId: string;
  locationId: string;
  receiptDate: string;
  supplierInvoiceNumber: string;
  supplierDeliveryNoteNumber: string;
  reason: string;
  notes: string;
  currencyCode: string;
  lines: GrnLine[];
};

type StoredDraft = {
  version: 1;
  savedAt: number;
  mode: GoodsReceiptMode;
  receiptId?: string;
  form: GrnForm;
  hadAttachment: boolean;
};

const DIRECT_REASON = "Supplier delivery without PO";
const DRAFT_TTL = 24 * 60 * 60 * 1000;

function localToday() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function num(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function blankForm(mode: GoodsReceiptMode, defaultLocation: string): GrnForm {
  const direct = mode === "create-direct";
  return {
    receiptType: direct ? "DIRECT" : "PO_BASED",
    purchaseOrderId: "",
    poNumber: "",
    supplierId: "",
    locationId: defaultLocation,
    receiptDate: localToday(),
    supplierInvoiceNumber: "",
    supplierDeliveryNoteNumber: "",
    reason: direct ? DIRECT_REASON : "",
    notes: "",
    currencyCode: "LKR",
    lines: [],
  };
}

function splitDirectNotes(value: string | null | undefined) {
  const text = value ?? "";
  const prefix = "Direct GRN reason: ";
  if (!text.startsWith(prefix)) return { reason: DIRECT_REASON, notes: text };
  const [first, ...rest] = text.split("\n\n");
  return { reason: first.slice(prefix.length) || DIRECT_REASON, notes: rest.join("\n\n") };
}


function lineFromReceipt(line: any): GrnLine {
  return {
    purchaseOrderLineId: line.purchaseOrderLineId ?? undefined,
    productId: String(line.productId ?? ""),
    productName: line.product?.productName ?? "Product",
    sku: line.product?.sku ?? "",
    productUnitId: String(line.productUnitId ?? ""),
    unitId: String(line.unitId ?? ""),
    unitLabel:
      line.productUnit?.unit?.name ?? line.productUnit?.unit?.code ?? "Unit",
    receivedQty: String(line.receivedQty ?? "0"),
    unitCost: String(line.unitCost ?? "0"),
    discountAmount: String(line.discountAmount ?? "0"),
    taxAmount: String(line.taxAmount ?? "0"),
    sourceSupplierPriceId: line.sourceSupplierPriceId ?? undefined,
    baselineUnitCost: String(line.unitCost ?? "0"),
    costOverrideReason: line.costOverrideReason ?? "",
    batchNumber: line.batchNumber ?? "",
    manufactureDate: line.manufactureDate?.slice?.(0, 10) ?? "",
    expiryDate: line.expiryDate?.slice?.(0, 10) ?? "",
  };
}

function formFromReceipt(receipt: GoodsReceipt): GrnForm {
  const parsed = splitDirectNotes(receipt.notes);
  return {
    receiptType: receipt.receiptType,
    purchaseOrderId: String(receipt.purchaseOrderId ?? ""),
    poNumber: "",
    supplierId: String(receipt.supplierId ?? ""),
    locationId: String(receipt.locationId ?? ""),
    receiptDate: String(receipt.receiptDate ?? "").slice(0, 10),
    supplierInvoiceNumber: receipt.supplierInvoiceNumber ?? "",
    supplierDeliveryNoteNumber: receipt.supplierDeliveryNoteNumber ?? "",
    reason: receipt.receiptType === "DIRECT" ? parsed.reason : "",
    notes: receipt.receiptType === "DIRECT" ? parsed.notes : receipt.notes ?? "",
    currencyCode: receipt.currencyCode || "LKR",
    lines: (receipt.lines ?? []).map(lineFromReceipt),
  };
}

function statusLabel(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function GoodsReceiptScreen({ mode }: { mode: GoodsReceiptMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const queryClient = useQueryClient();
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const restoredKey = useRef("");
  const receiptId = params.id ? Number(params.id) : undefined;
  const returnTo =
    typeof (location.state as { returnTo?: unknown } | null)?.returnTo === "string" &&
    (location.state as { returnTo: string }).returnTo.startsWith("/goods-receipts")
      ? (location.state as { returnTo: string }).returnTo
      : "/goods-receipts";
  const isCreate = mode === "create-direct" || mode === "create-po-based";
  const {
    permissions,
    accessScope,
    currentLocationId,
    tenant,
    tenantUser,
  } = useAuth();
  const defaultLocation =
    accessScope === "LOCATION" ? String(currentLocationId ?? "") : "";
  const [form, setForm] = useState<GrnForm>(() =>
    blankForm(mode, defaultLocation),
  );
  const [ready, setReady] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [restored, setRestored] = useState(false);
  const [attachmentMustReselect, setAttachmentMustReselect] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const deferredSearch = useDeferredValue(search.trim());

  const storageKey = useMemo(() => {
    if (mode === "view" || !tenant?.tenantId || !tenantUser?.userId) return "";
    return `grn-form-draft:${tenant.tenantId}:${tenantUser.userId}:${mode}:${receiptId ?? "new"}`;
  }, [mode, receiptId, tenant?.tenantId, tenantUser?.userId]);

  const receipt = useQuery({
    queryKey: ["goods-receipts", receiptId],
    queryFn: () => purchasingApi.getReceipt(receiptId!),
    enabled: !isCreate && Number.isInteger(receiptId),
  });
  const suppliers = useQuery({ queryKey: ["suppliers"], queryFn: suppliersApi.list });
  const locations = useQuery({ queryKey: ["locations"], queryFn: locationsApi.list });
  const products = useQuery({ queryKey: ["products"], queryFn: productsApi.list });
  const orders = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: purchasingApi.listOrders,
    enabled: mode === "create-po-based" || form.receiptType === "PO_BASED",
  });
  const productSearch = usePurchasingProductSearch(deferredSearch, form.receiptType === "DIRECT");

  useEffect(() => {
    if (!storageKey || restoredKey.current === storageKey) return;
    restoredKey.current = storageKey;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw) as StoredDraft;
        if (
          draft.version === 1 &&
          draft.mode === mode &&
          draft.receiptId === (receiptId ? String(receiptId) : undefined) &&
          Date.now() - draft.savedAt <= DRAFT_TTL
        ) {
          setForm(draft.form);
          setRestored(true);
          setDirty(true);
          setAttachmentMustReselect(draft.hadAttachment);
          setReady(true);
          return;
        }
        sessionStorage.removeItem(storageKey);
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    if (isCreate) setReady(true);
  }, [isCreate, mode, receiptId, storageKey]);

  useEffect(() => {
    if (!receipt.data || (mode === "edit" && ready)) return;
    setForm(formFromReceipt(receipt.data));
    setReady(true);
    setDirty(false);
  }, [mode, ready, receipt.data]);

  useEffect(() => {
    if (!storageKey || !ready || !dirty) return;
    const timer = window.setTimeout(() => {
      const draft: StoredDraft = {
        version: 1,
        savedAt: Date.now(),
        mode,
        receiptId: receiptId ? String(receiptId) : undefined,
        form,
        hadAttachment: Boolean(attachment || attachmentMustReselect),
      };
      sessionStorage.setItem(storageKey, JSON.stringify(draft));
    }, 450);
    return () => window.clearTimeout(timer);
  }, [attachment, attachmentMustReselect, dirty, form, mode, ready, receiptId, storageKey]);

  const updateForm = (patch: Partial<GrnForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
    setMessage("");
  };

  const inventoryProducts = useMemo(
    () =>
      (products.data ?? []).filter(
        (product: any) =>
          product.isActive !== false &&
          product.isPurchasable !== false &&
          product.isStockItem !== false,
      ),
    [products.data],
  );
  const searchResults = useMemo(() => {
    const ids = deferredSearch
      ? new Set((productSearch.data?.items ?? []).map((item: any) => String(item.productId)))
      : null;
    return inventoryProducts
      .filter(
        (product: any) =>
          (!ids || ids.has(String(product.productId))) &&
          purchaseUnits(product, form.supplierId).length > 0,
      )
      .slice(0, 12);
  }, [deferredSearch, form.supplierId, inventoryProducts, productSearch.data]);

  const clearStoredDraft = () => {
    if (storageKey) sessionStorage.removeItem(storageKey);
  };

  const choosePo = async (value: string) => {
    if (!value) return;
    setMessage("");
    try {
      const po = await purchasingApi.getOrder(Number(value));
      if (!["APPROVED", "PART_RECEIVED"].includes(po.status)) throw new Error("Only approved Purchase Orders with outstanding quantities can be received.");
      const openLines = (po.lines ?? [])
        .filter((line) => num(line.receivedQty) < num(line.orderedQty))
        .map((line) => {
          const outstanding = num(line.orderedQty) - num(line.receivedQty);
          return {
            purchaseOrderLineId: line.purchaseOrderLineId,
            productId: String(line.productId),
            productName: line.product?.productName ?? "Product",
            sku: line.product?.sku ?? "",
            productUnitId: String(line.productUnitId ?? ""),
            unitId: String(line.unitId),
            unitLabel:
              line.productUnit?.unit?.name ?? line.productUnit?.unit?.code ?? "Unit",
            receivedQty: String(outstanding),
            outstandingQty: String(outstanding),
            orderedQty: String(line.orderedQty),
            previouslyReceivedQty: String(line.receivedQty),
            unitCost: String(line.unitCost),
            discountAmount: String(line.discountAmount ?? "0"),
            taxAmount: String(line.taxAmount ?? "0"),
            sourceSupplierPriceId: line.sourceSupplierPriceId ?? undefined,
            baselineUnitCost: String(line.unitCost),
            costOverrideReason: line.costOverrideReason ?? "",
          } satisfies GrnLine;
        });
      updateForm({
        receiptType: "PO_BASED",
        purchaseOrderId: String(po.purchaseOrderId),
        poNumber: po.poNumber,
        supplierId: String(po.supplierId),
        locationId: String(po.locationId),
        currencyCode: po.currencyCode,
        lines: openLines,
      });
      if (!openLines.length) setMessage("This purchase order has no outstanding lines to receive.");
    } catch (error) {
      setMessage((error as Error).message);
    }
  };

  const addProduct = (product: any) => {
    if (!form.supplierId) {
      setMessage("Select a supplier before adding products.");
      return;
    }
    const available = purchaseUnits(product, form.supplierId).find(
      ({ productUnit }) =>
        !form.lines.some(
          (line) =>
            line.productId === String(product.productId) &&
            line.productUnitId === String(productUnit.productUnitId),
        ),
    );
    if (!available) {
      setMessage("This product and purchase unit is already present or unavailable for the supplier.");
      return;
    }
    const price = supplierPrice(
      available.supplierUnit,
      form.receiptDate,
      "1",
      form.currencyCode,
    );
    const line: GrnLine = {
      productId: String(product.productId),
      productName: product.productName,
      sku: product.sku,
      productUnitId: String(available.productUnit.productUnitId),
      unitId: String(available.productUnit.unitId),
      unitLabel: available.productUnit.unit?.name ?? available.productUnit.unit?.code ?? "Unit",
      receivedQty: "1",
      unitCost: price ? String(price.purchasePrice) : "0",
      discountAmount: "0",
      taxAmount: "0",
      sourceSupplierPriceId: price?.productSupplierPriceId,
      baselineUnitCost: price ? String(price.purchasePrice) : undefined,
      costOverrideReason: "",
      batchNumber: "",
      manufactureDate: "",
      expiryDate: "",
    };
    updateForm({ lines: [...form.lines, line] });
    setSearch("");
    setSearchOpen(false);
  };

  const updateLine = (index: number, key: keyof GrnLine, value: string) => {
    const next = form.lines.map((line, currentIndex) => {
      if (index !== currentIndex) return line;
      if (key === "receivedQty") {
        if (form.receiptType === "PO_BASED") {
          return { ...line, receivedQty: value };
        }
        const product = inventoryProducts.find(
          (item: any) => String(item.productId) === line.productId,
        );
        const unit = purchaseUnits(product, form.supplierId).find(
          ({ productUnit }) =>
            String(productUnit.productUnitId) === line.productUnitId,
        );
        const price = supplierPrice(
          unit?.supplierUnit,
          form.receiptDate,
          value,
          form.currencyCode,
        );
        const usingBaseline =
          line.baselineUnitCost === undefined ||
          num(line.unitCost) === num(line.baselineUnitCost);
        return {
          ...line,
          receivedQty: value,
          sourceSupplierPriceId: price?.productSupplierPriceId,
          baselineUnitCost: price ? String(price.purchasePrice) : undefined,
          ...(usingBaseline && {
            unitCost: price ? String(price.purchasePrice) : "0",
            costOverrideReason: "",
          }),
        };
      }
      if (key === "productUnitId") {
        const product = inventoryProducts.find(
          (item: any) => String(item.productId) === line.productId,
        );
        const unit = purchaseUnits(product, form.supplierId).find(
          ({ productUnit }) => String(productUnit.productUnitId) === value,
        );
        const price = supplierPrice(
          unit?.supplierUnit,
          form.receiptDate,
          line.receivedQty,
          form.currencyCode,
        );
        return {
          ...line,
          productUnitId: value,
          unitId: String(unit?.productUnit.unitId ?? ""),
          unitLabel: unit?.productUnit.unit?.name ?? unit?.productUnit.unit?.code ?? "Unit",
          unitCost: price ? String(price.purchasePrice) : "0",
          baselineUnitCost: price ? String(price.purchasePrice) : undefined,
          sourceSupplierPriceId: price?.productSupplierPriceId,
          costOverrideReason: "",
        };
      }
      return { ...line, [key]: value };
    });
    updateForm({ lines: next });
  };

  const refreshDirectPrices = (receiptDate: string) =>
    form.lines.map((line) => {
      const product = inventoryProducts.find(
        (item: any) => String(item.productId) === line.productId,
      );
      const unit = purchaseUnits(product, form.supplierId).find(
        ({ productUnit }) => String(productUnit.productUnitId) === line.productUnitId,
      );
      const price = supplierPrice(
        unit?.supplierUnit,
        receiptDate,
        line.receivedQty,
        form.currencyCode,
      );
      const usingBaseline =
        line.baselineUnitCost === undefined ||
        num(line.unitCost) === num(line.baselineUnitCost);
      return {
        ...line,
        sourceSupplierPriceId: price?.productSupplierPriceId,
        baselineUnitCost: price ? String(price.purchasePrice) : undefined,
        ...(usingBaseline && {
          unitCost: price ? String(price.purchasePrice) : "0",
          costOverrideReason: "",
        }),
      };
    });

  const validate = () => {
    if (!form.supplierId || !form.locationId || !form.receiptDate)
      return "Supplier, location, and receipt date are required.";
    if (form.receiptType === "DIRECT" && !form.reason)
      return "Reason is required for a Direct GRN.";
    if (form.receiptType === "PO_BASED" && !form.purchaseOrderId)
      return "Select an eligible purchase order.";
    if (!form.lines.length) return "Add at least one receipt line.";
    for (const line of form.lines) {
      if (!line.productId || !line.productUnitId || !line.unitId)
        return `A valid purchase unit is required for ${line.productName}.`;
      if (num(line.receivedQty) <= 0)
        return `Received quantity must be greater than zero for ${line.productName}.`;
      if (
        line.outstandingQty !== undefined &&
        num(line.receivedQty) > num(line.outstandingQty)
      )
        return `Received quantity for ${line.productName} cannot exceed the outstanding quantity.`;
      if (line.unitCost === "" || num(line.unitCost) < 0)
        return `Enter a valid unit cost for ${line.productName}.`;
      const override =
        line.baselineUnitCost === undefined ||
        num(line.unitCost) !== num(line.baselineUnitCost);
      if (override && !line.costOverrideReason.trim())
        return `Explain the unit-cost override for ${line.productName}.`;
    }
    return "";
  };

  const payload = (): GoodsReceiptPayload => ({
    receiptType: form.receiptType,
    ...(form.receiptType === "PO_BASED" && {
      purchaseOrderId: Number(form.purchaseOrderId),
    }),
    supplierId: Number(form.supplierId),
    locationId: Number(form.locationId),
    receiptDate: form.receiptDate,
    supplierInvoiceNumber: form.supplierInvoiceNumber.trim() || undefined,
    supplierDeliveryNoteNumber:
      form.supplierDeliveryNoteNumber.trim() || undefined,
    currencyCode: form.currencyCode,
    notes:
      form.receiptType === "DIRECT"
        ? [`Direct GRN reason: ${form.reason}`, form.notes.trim()]
            .filter(Boolean)
            .join("\n\n")
        : form.notes.trim() || undefined,
    lines: form.lines.map((line) => ({
      ...(line.purchaseOrderLineId != null && {
        purchaseOrderLineId: Number(line.purchaseOrderLineId),
      }),
      productId: Number(line.productId),
      productUnitId: Number(line.productUnitId),
      unitId: Number(line.unitId),
      receivedQty: num(line.receivedQty),
      unitCost: num(line.unitCost),
      discountAmount: num(line.discountAmount),
      taxAmount: num(line.taxAmount),
      ...(line.sourceSupplierPriceId != null &&
        line.sourceSupplierPriceId !== "" && {
          sourceSupplierPriceId: Number(line.sourceSupplierPriceId),
        }),
      costOverrideReason: line.costOverrideReason.trim() || undefined,
      batchNumber: line.batchNumber?.trim() || undefined,
      manufactureDate: line.manufactureDate || undefined,
      expiryDate: line.expiryDate || undefined,
    })),
  });

  const save = useMutation({
    mutationFn: (data: GoodsReceiptPayload) =>
      mode === "edit" && receiptId
        ? purchasingApi.updateReceipt(receiptId, data)
        : purchasingApi.createReceipt(data),
    onSuccess: async () => {
      clearStoredDraft();
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      navigate(returnTo);
    },
  });
  const post = useMutation({
    mutationFn: () => purchasingApi.postReceipt(receiptId!),
    onSuccess: async () => {
      clearStoredDraft();
      setDirty(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["goods-receipts"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      ]);
      navigate(`/goods-receipts/${receiptId}/view`, {
        replace: true,
        state: { returnTo },
      });
    },
  });

  const onSave = () => {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }
    save.mutate(payload());
  };

  const onCancel = () => {
    if (dirty) setDiscardOpen(true);
    else navigate(returnTo);
  };

  if (!isCreate && (!ready || receipt.isLoading)) {
    return <div className="direct-grn-page grn-loading">Loading GRN…</div>;
  }
  if (!isCreate && (receipt.isError || !receipt.data)) {
    return (
      <div className="direct-grn-page">
        <div className="error-box">{(receipt.error as Error)?.message || "GRN was not found."}</div>
      </div>
    );
  }

  const status = receipt.data?.status ?? "DRAFT";
  const immutable = !isCreate && receipt.data?.status !== "DRAFT";
  const editable = mode !== "view" && !immutable;
  const canSave = permissions.includes(isCreate ? "GRN_CREATE" : "GRN_UPDATE");
  const canPost =
    mode === "edit" &&
    receipt.data?.status === "DRAFT" &&
    permissions.includes("GRN_POST");
  const kind = form.receiptType === "DIRECT" ? "Direct" : "PO-Based";
  const receiptLabel = receipt.data?.grnNumber || "Draft";
  const title = isCreate
    ? `Create ${kind} GRN`
    : `${mode === "view" ? "View" : "Edit"} ${kind} GRN — ${receiptLabel}`;
  const totalUnits = form.lines.reduce((sum, line) => sum + num(line.receivedQty), 0);
  const total = form.lines.reduce(
    (sum, line) =>
      sum +
      num(line.receivedQty) *
        (num(line.unitCost) - num(line.discountAmount) + num(line.taxAmount)),
    0,
  );
  const visibleError = (save.error || post.error) as Error | null;

  return (
    <form
      className="direct-grn-page"
      onSubmit={(event) => {
        event.preventDefault();
        if (editable) onSave();
      }}
    >
      <header className="direct-grn-head">
        <div className="direct-grn-title-row">
          <h1>{title}</h1>
          <span className={`grn-status-badge grn-status-${status.toLowerCase()}`}>
            {statusLabel(status)}
          </span>
        </div>
        <nav className="direct-grn-breadcrumb" aria-label="Breadcrumb">
          <span>Inventory</span><b>/</b><span>Goods Received Notes</span><b>/</b><strong>{title}</strong>
        </nav>
        {restored && <div className="grn-restored-message">Your unsaved GRN draft has been restored.</div>}
        {immutable && (
          <div className="grn-readonly-message">
            This GRN is {statusLabel(status).toLowerCase()} and can no longer be edited.
          </div>
        )}
      </header>

      <div className="direct-grn-layout">
        <div className="direct-grn-main">
          <section className="direct-grn-card receipt-details-card">
            <h2>Receipt Details</h2>
            <div className="direct-grn-fields">
              {form.receiptType === "PO_BASED" && (
                <SearchableSelect
                  label="Purchase Order Number"
                  value={form.purchaseOrderId}
                  onChange={choosePo}
                  options={(orders.data ?? [])
                    .filter((order: PurchaseOrder) =>
                      ["APPROVED", "PART_RECEIVED"].includes(order.status),
                    )
                    .map((order: PurchaseOrder) => ({ value: order.purchaseOrderId, label: order.poNumber }))}
                  selectedLabel={form.poNumber || (form.purchaseOrderId ? "Loading purchase order…" : "")}
                  placeholder="Search purchase order"
                  emptyMessage="No eligible purchase orders found."
                  required
                  disabled={!editable || mode === "edit"}
                />
              )}
              <SearchableSelect
                label="Supplier"
                value={form.supplierId}
                onChange={(value) => updateForm({ supplierId: value, lines: [] })}
                options={(suppliers.data ?? []).filter((item: any) => item.isActive !== false).map((item: any) => ({ value: item.supplierId, label: item.supplierName, code: item.supplierCode }))}
                placeholder="Search supplier"
                emptyMessage="No active suppliers found."
                required
                disabled={!editable || form.receiptType === "PO_BASED"}
              />
              <SearchableSelect
                label="Location"
                value={form.locationId}
                onChange={(value) => updateForm({ locationId: value })}
                options={(locations.data ?? []).filter((item: any) => item.isActive !== false).filter((item: any) => accessScope !== "LOCATION" || String(item.locationId) === String(currentLocationId)).map((item: any) => ({ value: item.locationId, label: item.name, code: item.code }))}
                placeholder="Search location"
                emptyMessage="No accessible locations found."
                required
                disabled={!editable || form.receiptType === "PO_BASED" || accessScope === "LOCATION"}
              />
              <label className="field"><span>Receipt Date<span className="required">*</span></span><input className="control" type="date" value={form.receiptDate} disabled={!editable} onChange={(event) => updateForm({ receiptDate: event.target.value, lines: form.receiptType === "DIRECT" ? refreshDirectPrices(event.target.value) : form.lines })} required /></label>
              <label className="field"><span>Supplier Invoice No.</span><input className="control" value={form.supplierInvoiceNumber} disabled={!editable} maxLength={100} onChange={(event) => updateForm({ supplierInvoiceNumber: event.target.value })} /></label>
              {form.receiptType === "PO_BASED" && <label className="field"><span>Delivery Note Number</span><input className="control" value={form.supplierDeliveryNoteNumber} disabled={!editable} maxLength={100} onChange={(event) => updateForm({ supplierDeliveryNoteNumber: event.target.value })} /></label>}
              {form.receiptType === "DIRECT" && <label className="field"><span>Reason<span className="required">*</span></span><select className="control" value={form.reason} disabled={!editable} onChange={(event) => updateForm({ reason: event.target.value })} required><option value="">Select…</option><option value={DIRECT_REASON}>{DIRECT_REASON}</option></select></label>}
            </div>

            {editable && form.receiptType === "DIRECT" && (
              <div className="direct-product-search">
                <span aria-hidden="true">⌕</span>
                <input ref={searchInput} value={search} onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearch(event.target.value); setSearchOpen(true); }} placeholder="Search SKU, barcode or product" aria-label="Search SKU, barcode or product" />
                {searchOpen && search.trim() && <div className="direct-product-results">{productSearch.isFetching ? <div className="direct-product-empty">Searching…</div> : searchResults.length ? searchResults.map((product: any) => <button key={product.productId} type="button" onClick={() => addProduct(product)}><strong>{product.productName}</strong><span>{product.sku}</span></button>) : <div className="direct-product-empty">No eligible products found for this supplier.</div>}</div>}
              </div>
            )}

            {form.receiptType === "PO_BASED" && isCreate && !form.purchaseOrderId && (
              <div className="grn-integration-state">Select an eligible purchase order to load its outstanding lines.</div>
            )}

            <div className="direct-lines-wrap">
              <table className="direct-lines-table">
                <thead><tr><th>Product</th><th>Qty</th><th>Purchase Unit</th><th>Unit Cost</th><th>Tax</th><th>{editable ? "Remove" : "Total"}</th></tr></thead>
                <tbody>
                  {!form.lines.length ? <tr><td colSpan={6} className="direct-lines-empty">{form.receiptType === "DIRECT" ? "Search for a product to add the first receipt line." : "No outstanding purchase-order lines loaded."}</td></tr> : form.lines.map((line, index) => {
                    const product = inventoryProducts.find((item: any) => String(item.productId) === line.productId);
                    const units = purchaseUnits(product, form.supplierId);
                    const override = line.baselineUnitCost === undefined || num(line.unitCost) !== num(line.baselineUnitCost);
                    const lineTotal = num(line.receivedQty) * (num(line.unitCost) - num(line.discountAmount) + num(line.taxAmount));
                    return <tr key={`${line.purchaseOrderLineId ?? line.productId}-${index}`}>
                      <td><div className="direct-product-cell"><strong>{line.productName}</strong><span>{line.sku}{line.outstandingQty !== undefined ? ` · Outstanding ${line.outstandingQty}` : ""}</span></div></td>
                      <td><input className="control" type="number" min="0.0001" max={line.outstandingQty} step="any" value={line.receivedQty} disabled={!editable} onChange={(event) => updateLine(index, "receivedQty", event.target.value)} aria-label={`Quantity for ${line.productName}`} /></td>
                      <td>{form.receiptType === "DIRECT" && editable ? <select className="control" value={line.productUnitId} onChange={(event) => updateLine(index, "productUnitId", event.target.value)}>{units.map(({ productUnit }) => <option key={productUnit.productUnitId} value={productUnit.productUnitId}>{productUnit.unit?.name ?? productUnit.unit?.code ?? productUnit.unitId}</option>)}</select> : <input className="control" value={line.unitLabel} disabled />}</td>
                      <td><div className="direct-cost-cell"><div className="direct-money-input"><span>{form.currencyCode}</span><input className="control" type="number" min="0" step="0.0001" value={line.unitCost} disabled={!editable} onChange={(event) => updateLine(index, "unitCost", event.target.value)} /></div>{override && editable && <input className="direct-override-reason" value={line.costOverrideReason} maxLength={500} onChange={(event) => updateLine(index, "costOverrideReason", event.target.value)} placeholder="Explain cost override" />}</div></td>
                      <td><input className="control" type="number" min="0" step="0.0001" value={line.taxAmount} disabled={!editable} onChange={(event) => updateLine(index, "taxAmount", event.target.value)} aria-label={`Tax amount for ${line.productName}`} /></td>
                      <td className="direct-remove-cell">{editable ? <button type="button" aria-label={`Remove ${line.productName}`} onClick={() => updateForm({ lines: form.lines.filter((_, i) => i !== index) })}>×</button> : <strong>{money(lineTotal)}</strong>}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
            {editable && form.receiptType === "DIRECT" && <button className="direct-add-product" type="button" onClick={() => { setSearchOpen(true); searchInput.current?.focus(); }}>＋ Add product</button>}
          </section>

          <section className="direct-grn-card">
            <h2>Notes &amp; Documents</h2>
            <div className="direct-notes-grid">
              <label className="field"><span>{form.receiptType === "DIRECT" ? "Reason / receiving notes" : "Receiving notes"}</span><textarea className="control" value={form.notes} disabled={!editable} onChange={(event) => updateForm({ notes: event.target.value })} placeholder="Add receiving notes" /></label>
              <div className="direct-attachment-field"><label>Attached Document</label><input ref={fileInput} className="direct-file-input" type="file" disabled={!editable} onChange={(event) => { setAttachment(event.target.files?.[0] ?? null); setAttachmentMustReselect(false); setDirty(true); }} /><div className="direct-attachment"><button type="button" className="direct-attachment-pick" disabled={!editable} onClick={() => fileInput.current?.click()}><span aria-hidden="true">▤</span><span><strong>{attachment ? "Supplier Invoice" : "Choose supplier invoice"}</strong><small>{attachment ? `${attachment.name} (${Math.max(1, Math.ceil(attachment.size / 1024))} KB)` : "Select a document from this device"}</small></span></button>{attachment && editable && <button type="button" className="direct-attachment-remove" onClick={() => { setAttachment(null); setDirty(true); if (fileInput.current) fileInput.current.value = ""; }}>×</button>}</div>
                {attachmentMustReselect && <small className="direct-integration-note">The supplier invoice attachment must be selected again after restoring this draft.</small>}
                {(attachment || editable) && <small className="direct-integration-note">The current backend has no GRN attachment upload endpoint. The selected file remains only in this page.</small>}
              </div>
            </div>
          </section>
        </div>

        <aside className="direct-summary-card" aria-label="Receipt summary"><div><span className="direct-summary-icon">#</span><span>{form.lines.length} {form.lines.length === 1 ? "line" : "lines"}</span></div><div><span className="direct-summary-icon">◇</span><span>{money(totalUnits)} units to receive</span></div><hr /><strong>Total</strong><b>{form.currencyCode} {money(total)}</b></aside>
      </div>

      {(visibleError || message) && <div className="error-box direct-grn-error">{visibleError?.message || message}</div>}
      {editable && !canSave && <div className="error-box direct-grn-error">Your role does not have permission to {isCreate ? "create" : "update"} goods receipts.</div>}

      <footer className="direct-grn-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>{mode === "view" || !editable ? "Back" : "Cancel"}</button>
        {editable && <button type="submit" className="btn btn-secondary direct-save-draft" disabled={!canSave || save.isPending}>{save.isPending ? "Saving…" : "Save Draft"}</button>}
        {canPost && <button type="button" className="btn btn-primary" disabled={post.isPending} onClick={() => window.confirm("Post this GRN? This will update inventory and the GRN cannot be edited afterwards.") && post.mutate()}>{post.isPending ? "Posting…" : "Post GRN"}</button>}
      </footer>

      <Modal open={discardOpen} title="Discard unsaved draft?" subtitle="Discard this unsaved GRN draft?" onClose={() => setDiscardOpen(false)}>
        <div className="modal-body"><p>Your temporary browser draft will be removed.</p></div>
        <div className="modal-foot"><button type="button" className="btn btn-secondary" onClick={() => setDiscardOpen(false)}>Keep editing</button><button type="button" className="btn btn-danger-soft" onClick={() => { clearStoredDraft(); setDirty(false); navigate(returnTo); }}>Discard draft</button></div>
      </Modal>
    </form>
  );
}
