import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { useAuth } from "../../auth/AuthContext";
import { locationsApi } from "../../locations/api/locationsApi";
import { productsApi } from "../../products/api/productsApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { purchasingApi } from "../api/purchasingApi";

type DirectLine = {
  productId: string;
  productName: string;
  sku: string;
  productUnitId: string;
  unitId: string;
  receivedQty: string;
  unitCost: string;
  sourceSupplierPriceId?: number;
  baselineUnitCost?: string;
  costOverrideReason: string;
};

const DIRECT_REASON = "Supplier delivery without PO";

function localToday() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function supplierLink(product: any, supplierId: string) {
  return (product?.productSuppliers ?? []).find(
    (link: any) =>
      link.isActive !== false && String(link.supplierId) === supplierId,
  );
}

function purchaseUnits(product: any, supplierId: string) {
  const link = supplierLink(product, supplierId);
  return (link?.supplierUnits ?? [])
    .filter((supplierUnit: any) => supplierUnit.isActive !== false)
    .map((supplierUnit: any) => {
      const productUnit = (product?.productUnits ?? []).find(
        (unit: any) =>
          unit.isActive !== false &&
          unit.isPurchaseUnit &&
          Number(unit.productUnitId) === Number(supplierUnit.productUnitId),
      );
      return productUnit ? { supplierUnit, productUnit } : null;
    })
    .filter(Boolean) as Array<{ supplierUnit: any; productUnit: any }>;
}

function supplierPrice(
  supplierUnit: any,
  receiptDate: string,
  quantity: string,
) {
  return (supplierUnit?.prices ?? [])
    .filter(
      (price: any) =>
        price.isActive !== false &&
        String(price.currencyCode ?? "").toUpperCase() === "LKR" &&
        number(price.minimumQuantity) <= number(quantity) &&
        String(price.effectiveFrom).slice(0, 10) <= receiptDate &&
        (!price.effectiveTo ||
          String(price.effectiveTo).slice(0, 10) >= receiptDate),
    )
    .sort(
      (a: any, b: any) =>
        number(b.minimumQuantity) - number(a.minimumQuantity) ||
        String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)),
    )[0];
}

function money(value: number) {
  return new Intl.NumberFormat("en-LK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function DirectGoodsReceiptPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const searchInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const { permissions, accessScope, currentLocationId } = useAuth();
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState(
    accessScope === "LOCATION" ? String(currentLocationId ?? "") : "",
  );
  const [receiptDate, setReceiptDate] = useState(localToday);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [reason, setReason] = useState(DIRECT_REASON);
  const [notes, setNotes] = useState("");
  const [attachment, setAttachment] = useState<File | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [searchOpen, setSearchOpen] = useState(false);
  const [lines, setLines] = useState<DirectLine[]>([]);
  const [message, setMessage] = useState("");

  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: suppliersApi.list,
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.list,
  });
  const products = useQuery({
    queryKey: ["products"],
    queryFn: productsApi.list,
  });
  const productSearch = useQuery({
    queryKey: ["products", "direct-grn-search", deferredSearch],
    queryFn: () =>
      productsApi.page({
        page: 1,
        limit: 20,
        search: deferredSearch,
        status: "active",
      }),
    enabled: deferredSearch.length > 0,
  });

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
    const matchingIds = deferredSearch
      ? new Set(
          (productSearch.data?.items ?? []).map((product: any) =>
            String(product.productId),
          ),
        )
      : null;
    return inventoryProducts
      .filter(
        (product: any) =>
          (!matchingIds || matchingIds.has(String(product.productId))) &&
          (!supplierId || purchaseUnits(product, supplierId).length > 0),
      )
      .slice(0, 12);
  }, [deferredSearch, inventoryProducts, productSearch.data, supplierId]);

  const saveDraft = useMutation({
    mutationFn: () =>
      purchasingApi.createReceipt({
        receiptType: "DIRECT",
        supplierId: Number(supplierId),
        locationId: Number(locationId),
        receiptDate,
        supplierInvoiceNumber: invoiceNumber.trim() || undefined,
        currencyCode: "LKR",
        notes: [`Direct GRN reason: ${reason}`, notes.trim()]
          .filter(Boolean)
          .join("\n\n"),
        lines: lines.map((line) => ({
          productId: Number(line.productId),
          productUnitId: Number(line.productUnitId),
          unitId: Number(line.unitId),
          receivedQty: number(line.receivedQty),
          unitCost: number(line.unitCost),
          ...(line.sourceSupplierPriceId != null && {
            sourceSupplierPriceId: Number(line.sourceSupplierPriceId),
          }),
          costOverrideReason: line.costOverrideReason.trim() || undefined,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goods-receipts"] });
      navigate("/goods-receipts");
    },
  });

  const addProduct = (product: any) => {
    setMessage("");
    if (!supplierId) {
      setMessage("Select a supplier before adding products.");
      return;
    }
    const units = purchaseUnits(product, supplierId);
    const available = units.find(
      ({ productUnit }) =>
        !lines.some(
          (line) =>
            line.productId === String(product.productId) &&
            line.productUnitId === String(productUnit.productUnitId),
        ),
    );
    if (!available) {
      setMessage(
        units.length
          ? "This product and purchase unit is already in the receipt."
          : "This supplier has no active purchase unit for the selected product.",
      );
      return;
    }
    const price = supplierPrice(available.supplierUnit, receiptDate, "1");
    setLines((current) => [
      ...current,
      {
        productId: String(product.productId),
        productName: product.productName,
        sku: product.sku,
        productUnitId: String(available.productUnit.productUnitId),
        unitId: String(available.productUnit.unitId),
        receivedQty: "1",
        unitCost: price ? String(price.purchasePrice) : "0",
        sourceSupplierPriceId:
          price?.productSupplierPriceId != null
            ? Number(price.productSupplierPriceId)
            : undefined,
        baselineUnitCost: price ? String(price.purchasePrice) : undefined,
        costOverrideReason: "",
      },
    ]);
    setSearch("");
    setSearchOpen(false);
  };

  const updateLine = (index: number, key: keyof DirectLine, value: string) => {
    setMessage("");
    if (
      key === "productUnitId" &&
      lines.some(
        (candidate, candidateIndex) =>
          candidateIndex !== index &&
          candidate.productId === lines[index]?.productId &&
          candidate.productUnitId === value,
      )
    ) {
      setMessage("Duplicate product and purchase-unit rows are not allowed.");
      return;
    }
    setLines((current) =>
      current.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const product = inventoryProducts.find(
          (candidate: any) =>
            String(candidate.productId) === String(line.productId),
        );
        if (key === "productUnitId") {
          const unit = purchaseUnits(product, supplierId).find(
            ({ productUnit }) => String(productUnit.productUnitId) === value,
          );
          const price = supplierPrice(
            unit?.supplierUnit,
            receiptDate,
            line.receivedQty,
          );
          return {
            ...line,
            productUnitId: value,
            unitId: String(unit?.productUnit.unitId ?? ""),
            unitCost: price ? String(price.purchasePrice) : "0",
            baselineUnitCost: price ? String(price.purchasePrice) : undefined,
            sourceSupplierPriceId:
              price?.productSupplierPriceId != null
                ? Number(price.productSupplierPriceId)
                : undefined,
            costOverrideReason: "",
          };
        }
        if (key === "receivedQty") {
          const unit = purchaseUnits(product, supplierId).find(
            ({ productUnit }) =>
              String(productUnit.productUnitId) === line.productUnitId,
          );
          const price = supplierPrice(unit?.supplierUnit, receiptDate, value);
          const usingBaseline =
            line.baselineUnitCost === undefined ||
            number(line.unitCost) === number(line.baselineUnitCost);
          return {
            ...line,
            receivedQty: value,
            baselineUnitCost: price ? String(price.purchasePrice) : undefined,
            sourceSupplierPriceId:
              price?.productSupplierPriceId != null
                ? Number(price.productSupplierPriceId)
                : undefined,
            ...(usingBaseline
              ? {
                  unitCost: price ? String(price.purchasePrice) : "0",
                  costOverrideReason: "",
                }
              : {}),
          };
        }
        return { ...line, [key]: value };
      }),
    );
  };

  const validateDraft = () => {
    if (!supplierId || !locationId || !receiptDate)
      return "Supplier, location, and receipt date are required to save a draft.";
    if (!lines.length) return "Add at least one product to save a draft.";
    for (const line of lines) {
      if (!line.productId || !line.productUnitId || !line.unitId)
        return "Every line requires a valid product purchase unit.";
      if (number(line.receivedQty) <= 0)
        return "Every line quantity must be greater than zero.";
      if (line.unitCost === "" || number(line.unitCost) < 0)
        return "Every line requires a valid unit cost.";
      const override =
        !line.sourceSupplierPriceId ||
        number(line.unitCost) !== number(line.baselineUnitCost);
      if (override && !line.costOverrideReason.trim())
        return `Explain the unit-cost override for ${line.productName}.`;
    }
    return "";
  };

  const onSaveDraft = () => {
    setMessage("");
    const validation = validateDraft();
    if (validation) {
      setMessage(validation);
      return;
    }
    saveDraft.mutate();
  };

  const onSubmitForApproval = () => {
    const validation = validateDraft();
    if (validation) {
      setMessage(validation);
      return;
    }
    if (!reason) {
      setMessage("Reason is required before submitting for approval.");
      return;
    }
    setMessage(
      "Submit for Approval is not available yet: the existing GRN backend has no approval status or submission endpoint, and no tax-master endpoint is available for tax validation. This action will not save, submit, or post inventory.",
    );
  };

  const lineCount = lines.length;
  const totalUnits = lines.reduce(
    (total, line) => total + number(line.receivedQty),
    0,
  );
  const total = lines.reduce(
    (sum, line) => sum + number(line.receivedQty) * number(line.unitCost),
    0,
  );
  const requestError = saveDraft.error
    ? (saveDraft.error as Error).message
    : message;
  const canCreate = permissions.includes("GRN_CREATE");

  return (
    <form
      className="direct-grn-page"
      onSubmit={(event) => {
        event.preventDefault();
        onSaveDraft();
      }}
    >
      <header className="direct-grn-head">
        <div className="direct-grn-title-row">
          <h1>Create Direct GRN</h1>
          <span className="direct-grn-approval-badge">Approval Required</span>
        </div>
        <nav className="direct-grn-breadcrumb" aria-label="Breadcrumb">
          <span>Inventory</span>
          <b>/</b>
          <span>Goods Received Notes</span>
          <b>/</b>
          <strong>Create Direct GRN</strong>
        </nav>
      </header>

      <div className="direct-grn-layout">
        <div className="direct-grn-main">
          <section className="direct-grn-card receipt-details-card">
            <h2>Receipt Details</h2>
            <div className="direct-grn-fields">
              <SearchableSelect
                label="Supplier"
                value={supplierId}
                onChange={(value) => {
                  setSupplierId(value);
                  setLines([]);
                  setMessage("");
                }}
                options={(suppliers.data ?? [])
                  .filter((supplier) => supplier.isActive !== false)
                  .map((supplier) => ({
                    value: supplier.supplierId,
                    label: supplier.supplierName,
                    code: supplier.supplierCode,
                  }))}
                placeholder="Search supplier"
                emptyMessage="No active suppliers found."
                required
              />
              <SearchableSelect
                label="Location"
                value={locationId}
                onChange={(value) => {
                  setLocationId(value);
                  setMessage("");
                }}
                options={(locations.data ?? [])
                  .filter((location) => location.isActive !== false)
                  .filter(
                    (location) =>
                      accessScope !== "LOCATION" ||
                      String(location.locationId) === String(currentLocationId),
                  )
                  .map((location) => ({
                    value: location.locationId,
                    label: location.name,
                    code: location.code,
                  }))}
                placeholder="Search location"
                emptyMessage="No accessible locations found."
                required
                disabled={accessScope === "LOCATION"}
              />
              <label className="field">
                <span>
                  Receipt Date<span className="required">*</span>
                </span>
                <input
                  className="control"
                  type="date"
                  value={receiptDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setReceiptDate(nextDate);
                    setLines((current) =>
                      current.map((line) => {
                        const product = inventoryProducts.find(
                          (candidate: any) =>
                            String(candidate.productId) === line.productId,
                        );
                        const unit = purchaseUnits(product, supplierId).find(
                          ({ productUnit }) =>
                            String(productUnit.productUnitId) ===
                            line.productUnitId,
                        );
                        const price = supplierPrice(
                          unit?.supplierUnit,
                          nextDate,
                          line.receivedQty,
                        );
                        const usingBaseline =
                          line.baselineUnitCost === undefined ||
                          number(line.unitCost) ===
                            number(line.baselineUnitCost);
                        return {
                          ...line,
                          baselineUnitCost: price
                            ? String(price.purchasePrice)
                            : undefined,
                          sourceSupplierPriceId: price?.productSupplierPriceId,
                          ...(usingBaseline
                            ? {
                                unitCost: price
                                  ? String(price.purchasePrice)
                                  : "0",
                                costOverrideReason: "",
                              }
                            : {}),
                        };
                      }),
                    );
                  }}
                  required
                />
              </label>
              <label className="field">
                <span>Supplier Invoice No.</span>
                <input
                  className="control"
                  value={invoiceNumber}
                  maxLength={100}
                  onChange={(event) => setInvoiceNumber(event.target.value)}
                  placeholder="Enter invoice number"
                />
              </label>
              <label className="field">
                <span>
                  Reason<span className="required">*</span>
                </span>
                <select
                  className="control"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                >
                  <option value="">Select...</option>
                  <option value={DIRECT_REASON}>{DIRECT_REASON}</option>
                </select>
              </label>
            </div>

            <div className="direct-grn-warning" role="status">
              <span aria-hidden="true">!</span>
              No purchase order match — this receipt requires approval before
              posting.
            </div>

            <div className="direct-product-search">
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchInput}
                value={search}
                onFocus={() => setSearchOpen(true)}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSearchOpen(true);
                }}
                placeholder="Search SKU, barcode or product"
                aria-label="Search SKU, barcode or product"
              />
              {searchOpen && search.trim() && (
                <div className="direct-product-results">
                  {productSearch.isFetching ? (
                    <div className="direct-product-empty">Searching…</div>
                  ) : searchResults.length ? (
                    searchResults.map((product: any) => (
                      <button
                        key={product.productId}
                        type="button"
                        onClick={() => addProduct(product)}
                      >
                        <strong>{product.productName}</strong>
                        <span>{product.sku}</span>
                      </button>
                    ))
                  ) : (
                    <div className="direct-product-empty">
                      No eligible products found for this supplier.
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="direct-lines-wrap">
              <table className="direct-lines-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Purchase Unit</th>
                    <th>Unit Cost</th>
                    <th>Tax</th>
                    <th>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="direct-lines-empty">
                        Search for a product to add the first receipt line.
                      </td>
                    </tr>
                  ) : (
                    lines.map((line, index) => {
                      const product = inventoryProducts.find(
                        (candidate: any) =>
                          String(candidate.productId) === line.productId,
                      );
                      const units = purchaseUnits(product, supplierId);
                      const overrideRequired =
                        !line.sourceSupplierPriceId ||
                        number(line.unitCost) !== number(line.baselineUnitCost);
                      return (
                        <tr key={`${line.productId}-${index}`}>
                          <td>
                            <div className="direct-product-cell">
                              <strong>{line.productName}</strong>
                              <span>{line.sku}</span>
                            </div>
                          </td>
                          <td>
                            <input
                              className="control"
                              type="number"
                              min="0.0001"
                              step="any"
                              value={line.receivedQty}
                              onChange={(event) =>
                                updateLine(
                                  index,
                                  "receivedQty",
                                  event.target.value,
                                )
                              }
                              aria-label={`Quantity for ${line.productName}`}
                            />
                          </td>
                          <td>
                            <select
                              className="control"
                              value={line.productUnitId}
                              onChange={(event) =>
                                updateLine(
                                  index,
                                  "productUnitId",
                                  event.target.value,
                                )
                              }
                              aria-label={`Purchase unit for ${line.productName}`}
                            >
                              {units.map(({ productUnit }) => (
                                <option
                                  key={productUnit.productUnitId}
                                  value={productUnit.productUnitId}
                                >
                                  {productUnit.unit?.name ??
                                    productUnit.unit?.code ??
                                    productUnit.unitId}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <div className="direct-cost-cell">
                              <div className="direct-money-input">
                                <span>LKR</span>
                                <input
                                  className="control"
                                  type="number"
                                  min="0"
                                  step="0.0001"
                                  value={line.unitCost}
                                  onChange={(event) =>
                                    updateLine(
                                      index,
                                      "unitCost",
                                      event.target.value,
                                    )
                                  }
                                  aria-label={`Unit cost for ${line.productName}`}
                                />
                              </div>
                              {overrideRequired && (
                                <input
                                  className="direct-override-reason"
                                  value={line.costOverrideReason}
                                  maxLength={500}
                                  onChange={(event) =>
                                    updateLine(
                                      index,
                                      "costOverrideReason",
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Explain cost override"
                                  aria-label={`Cost override reason for ${line.productName}`}
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            <select
                              className="control direct-tax-unavailable"
                              value=""
                              disabled
                              aria-label={`Tax for ${line.productName}`}
                              title="No tax master API exists in the current application"
                            >
                              <option value="">Not configured</option>
                            </select>
                          </td>
                          <td className="direct-remove-cell">
                            <button
                              type="button"
                              aria-label={`Remove ${line.productName}`}
                              onClick={() =>
                                setLines((current) =>
                                  current.filter(
                                    (_, lineIndex) => lineIndex !== index,
                                  ),
                                )
                              }
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <button
              className="direct-add-product"
              type="button"
              onClick={() => {
                setSearchOpen(true);
                searchInput.current?.focus();
              }}
            >
              ＋ Add product
            </button>
          </section>

          <section className="direct-grn-card direct-approval-notes">
            <h2>Approval &amp; Notes</h2>
            <div className="direct-notes-grid">
              <label className="field">
                <span>Reason / receiving notes</span>
                <textarea
                  className="control"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Add receiving notes for the approver"
                />
              </label>
              <div className="direct-attachment-field">
                <label>Attached Document</label>
                <input
                  ref={fileInput}
                  className="direct-file-input"
                  type="file"
                  onChange={(event) =>
                    setAttachment(event.target.files?.[0] ?? null)
                  }
                />
                <div className="direct-attachment">
                  <button
                    type="button"
                    className="direct-attachment-pick"
                    onClick={() => fileInput.current?.click()}
                  >
                    <span aria-hidden="true">▤</span>
                    <span>
                      <strong>
                        {attachment
                          ? "Supplier Invoice"
                          : "Choose supplier invoice"}
                      </strong>
                      <small>
                        {attachment
                          ? `${attachment.name} (${Math.max(1, Math.ceil(attachment.size / 1024))} KB)`
                          : "Select a document from this device"}
                      </small>
                    </span>
                  </button>
                  {attachment && (
                    <button
                      type="button"
                      className="direct-attachment-remove"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInput.current) fileInput.current.value = "";
                      }}
                      aria-label="Remove attached document"
                    >
                      ×
                    </button>
                  )}
                </div>
                <p>Direct receipts are recorded in the approval trail.</p>
                {attachment && (
                  <small className="direct-integration-note">
                    File selected locally. The current backend has no GRN upload
                    endpoint, so Save Draft will not upload this file.
                  </small>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="direct-summary-card" aria-label="Receipt summary">
          <div>
            <span className="direct-summary-icon">▤</span>
            <span>
              {lineCount} {lineCount === 1 ? "line" : "lines"}
            </span>
          </div>
          <div>
            <span className="direct-summary-icon">◇</span>
            <span>{money(totalUnits)} units to receive</span>
          </div>
          <hr />
          <strong>Total</strong>
          <b>LKR {money(total)}</b>
        </aside>
      </div>

      {requestError && (
        <div className="error-box direct-grn-error">{requestError}</div>
      )}
      {!canCreate && (
        <div className="error-box direct-grn-error">
          Your role does not have permission to create goods receipts.
        </div>
      )}

      <footer className="direct-grn-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate("/goods-receipts")}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-secondary direct-save-draft"
          disabled={!canCreate || saveDraft.isPending}
        >
          {saveDraft.isPending ? "Saving…" : "Save Draft"}
        </button>
        <button
          type="button"
          className="btn btn-primary direct-submit-approval"
          disabled={!canCreate || saveDraft.isPending}
          onClick={onSubmitForApproval}
        >
          Submit for Approval
        </button>
      </footer>
    </form>
  );
}
