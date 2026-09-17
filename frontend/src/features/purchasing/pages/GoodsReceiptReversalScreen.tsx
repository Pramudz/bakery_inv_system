import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Modal } from "../../../components/ui/Modal";
import { SearchableSelect } from "../../../components/ui/SearchableSelect";
import { useAuth } from "../../auth/AuthContext";
import { purchasingApi } from "../api/purchasingApi";

const amount = (value: string | number | undefined) =>
  value == null
    ? "—"
    : Number(value).toLocaleString("en-LK", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      });
const label = (value: string) =>
  value
    .toLowerCase()
    .split("_")
    .map((word) =>
      word === "wavg" ? "WAVG" : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
const productLabel = (item: { productDisplayName?: string; sku?: string; productName?: string }) =>
  item.productDisplayName || [item.sku, item.productName].filter(Boolean).join(" — ") || "Product unavailable";
const purchaseUnitLabel = (line: { purchaseUnitCode?: string; purchaseUnitName?: string; baseUnitCode?: string; conversionFactor?: string }) => {
  const unit = line.purchaseUnitCode || line.purchaseUnitName;
  if (!unit) return "Unit unavailable";
  return line.baseUnitCode && line.conversionFactor
    ? `${unit} × ${Number(line.conversionFactor).toLocaleString("en-LK", { minimumFractionDigits: 4, maximumFractionDigits: 6 })} ${line.baseUnitCode}`
    : unit;
};

export function GoodsReceiptReversalScreen() {
  const auth = useAuth();
  const allowed = auth.permissions.includes("GRN_REVERSE");
  const navigate = useNavigate();
  const client = useQueryClient();
  const [params, setParams] = useSearchParams();
  const selected = params.get("goodsReceiptId") ?? "";
  const validId =
    /^[1-9]\d*$/.test(selected) && Number.isSafeInteger(Number(selected));
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const [receiptType, setReceiptType] = useState("");
  const [reason, setReason] = useState("");
  const [negativeConfirmed, setNegativeConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changeSelection, setChangeSelection] = useState<string | null>(null);
  const scope = [auth.tenant?.tenantId, auth.tenantUser?.userId];

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setReason("");
    setNegativeConfirmed(false);
    setConfirmOpen(false);
  }, [selected]);
  const candidates = useQuery({
    queryKey: [
      "goods-receipts",
      "reversal-candidates",
      ...scope,
      page,
      debounced,
      receiptType,
    ],
    queryFn: () =>
      purchasingApi.reversalCandidates({
        page,
        limit: 20,
        search: debounced,
        receiptType,
      }),
    enabled: allowed,
  });
  const preview = useQuery({
    queryKey: ["goods-receipts", "reversal-preview", ...scope, selected],
    queryFn: () => purchasingApi.reversalPreview(Number(selected)),
    enabled: allowed && validId,
    refetchOnWindowFocus: false,
  });
  const data = preview.data;
  const receipt = data?.receipt;
  const reverse = useMutation({
    mutationFn: () =>
      purchasingApi.reverseReceipt(
        Number(selected),
        reason.trim(),
        negativeConfirmed,
      ),
    onSuccess: async () => {
      await Promise.all(
        [
          "goods-receipts",
          "inventory",
          "inventory-balances",
          "inventory-ledger",
          "inventory-age-layers",
          "products",
          "product-locations",
          "purchase-orders",
        ].map((key) => client.invalidateQueries({ queryKey: [key] })),
      );
      navigate(`/goods-receipts/${selected}/view`, { replace: true });
    },
    onError: async () => {
      setConfirmOpen(false);
      setNegativeConfirmed(false);
      await preview.refetch();
    },
  });
  const canReverse =
    allowed &&
    validId &&
    data?.eligible &&
    reason.trim().length > 0 &&
    reason.trim().length <= 1000 &&
    (!data.negativeStockLineCount || negativeConfirmed) &&
    !reverse.isPending &&
    !preview.isFetching &&
    !preview.isError;
  const select = (id: string) => {
    if (reverse.isPending || id === selected) return;
    if (reason.trim() || negativeConfirmed) {
      setChangeSelection(id);
      return;
    }
    reverse.reset();
    setParams(id ? { goodsReceiptId: id } : {});
    setReason("");
    setNegativeConfirmed(false);
  };
  if (!allowed)
    return (
      <div className="error-box" role="alert">
        Your role does not have permission to reverse goods receipts.
      </div>
    );
  const currency = receipt?.currencyCode ?? "LKR";

  return (
    <div className="direct-grn-page grn-reversal-page">
      <header className="direct-grn-head">
        <div className="direct-grn-title-row">
          <h1>Reverse Goods Received Note</h1>
          <span
            className={`grn-status-badge grn-status-${receipt?.status.toLowerCase() ?? "draft"}`}
          >
            {receipt ? label(receipt.status) : "Select GRN"}
          </span>
        </div>
        <nav className="direct-grn-breadcrumb" aria-label="Breadcrumb">
          <Link to="/">Inventory</Link>
          <span>/</span>
          <Link to="/goods-receipts">Goods Received Notes</Link>
          <span>/</span>
          <span>Reverse GRN</span>
        </nav>
      </header>
      <div className="direct-grn-layout">
        <div className="direct-grn-main">
          <section className="direct-grn-card">
            <h2>Select Posted GRN</h2>
            <div className="grn-reversal-search">
              <SearchableSelect
                label="Posted GRN"
                value={selected}
                selectedLabel={receipt?.grnNumber ?? (selected ? "Loading GRN…" : "")}
                onChange={select}
                disabled={reverse.isPending}
                options={(candidates.data?.items ?? []).map((row) => ({
                  value: row.goodsReceiptId,
                  label: row.grnNumber ?? "GRN unavailable",
                }))}
                placeholder="Search GRN number, supplier, invoice or PO number"
                emptyMessage={
                  candidates.isFetching ? "Searching…" : "No posted GRNs found."
                }
                serverFiltered
                onSearchChange={setSearch}
                renderOption={(option) => {
                  const row = candidates.data?.items.find(
                    (item) =>
                      String(item.goodsReceiptId) === String(option.value),
                  );
                  return (
                    row && (
                      <span className="grn-candidate">
                        <span>
                          <strong>{row.grnNumber}</strong> ·{" "}
                          {row.receiptType === "DIRECT" ? "Direct" : "PO-Based"}{" "}
                          <span className="grn-status-badge grn-status-posted">
                            Posted
                          </span>
                        </span>
                        <span>
                          {row.supplier?.supplierCode} ·{" "}
                          {row.supplier?.supplierName} · {row.location?.name}
                        </span>
                        <small>
                          {row.receiptDate} · PO{" "}
                          {row.purchaseOrder?.poNumber ?? "—"} · Invoice{" "}
                          {row.supplierInvoiceNumber ?? "—"} ·{" "}
                          {row.currencyCode} {amount(row.total)}
                        </small>
                      </span>
                    )
                  );
                }}
                menuFooter={
                  <div className="grn-candidate-pagination">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={page <= 1 || candidates.isFetching}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {candidates.data?.totalPages ?? 1}
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={
                        page >= (candidates.data?.totalPages ?? 1) ||
                        candidates.isFetching
                      }
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                }
              />
              <label className="field">
                <span>Receipt type</span>
                <select
                  className="control"
                  value={receiptType}
                  disabled={reverse.isPending}
                  onChange={(event) => {
                    setReceiptType(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All types</option>
                  <option value="DIRECT">Direct</option>
                  <option value="PO_BASED">PO-Based</option>
                </select>
              </label>
            </div>
            {candidates.error && (
              <div className="error-box" role="alert">
                {candidates.error.message}
              </div>
            )}
          </section>
          <div className="grn-readonly-message">
            This creates a compensating inventory transaction. The original
            posted GRN will not be deleted.
          </div>
          {selected && !validId && (
            <div className="error-box">Invalid GRN ID.</div>
          )}
          {preview.isFetching && <p role="status">Loading reversal preview…</p>}
          {preview.error && (
            <div className="error-box" role="alert">
              {preview.error.message}
            </div>
          )}
          {receipt && (
            <>
              <section className="direct-grn-card">
                <h2>Receipt Details</h2>
                <dl className="grn-reversal-details">
                  {Object.entries({
                    "GRN number": receipt.grnNumber,
                    "Receipt type":
                      receipt.receiptType === "DIRECT" ? "Direct" : "PO-Based",
                    Supplier: [receipt.supplier?.supplierCode, receipt.supplier?.supplierName].filter(Boolean).join(" — ") || "Supplier unavailable",
                    Location: [receipt.location?.code, receipt.location?.name].filter(Boolean).join(" — ") || "Location unavailable",
                    "Receipt date": receipt.receiptDate,
                    "Supplier invoice": receipt.supplierInvoiceNumber,
                    ...(receipt.receiptType === "PO_BASED"
                      ? { "PO number": receipt.purchaseOrder?.poNumber }
                      : {}),
                    "Current status": label(receipt.status),
                    "Posted at": receipt.postedAt
                      ? new Date(receipt.postedAt).toLocaleString()
                      : "—",
                    "Posted by": receipt.postedByName,
                  }).map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value ?? "—"}</dd>
                    </div>
                  ))}
                </dl>
                {!data.eligible && (
                  <div className="error-box" role="alert">
                    {data.blockingReason}
                  </div>
                )}
                {data.eligible && (
                  <div className="direct-lines-wrap">
                    <table className="table grn-reversal-lines">
                      <thead>
                        <tr>
                          {[
                            "Product / SKU",
                            "Received qty",
                            "Purchase unit",
                            "Base qty",
                            "Original unit cost",
                            "Original line value",
                            "Current qty",
                            "Current WAVG",
                            "Inventory relief",
                            "Variance",
                            "Projected qty",
                            "Valuation method",
                          ].map((title) => (
                            <th key={title}>{title}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.lines.map((line) => (
                          <tr
                            key={line.goodsReceiptLineId}
                            className={
                              line.createsNegativeStock
                                ? "grn-negative-line"
                                : ""
                            }
                          >
                            <td>
                              <strong>{productLabel(line)}</strong>
                            </td>
                            <td>{amount(line.receivedQty)}</td>
                            <td>
                              {purchaseUnitLabel(line)}
                            </td>
                            <td>{amount(line.baseQuantity)}</td>
                            <td>{amount(line.unitCost)}</td>
                            <td>{amount(line.originalDocumentValue)}</td>
                            <td>{amount(line.currentQuantity)}</td>
                            <td>{amount(line.currentWavg)}</td>
                            <td>{amount(line.inventoryReliefValue)}</td>
                            <td>{amount(line.costVariance)}</td>
                            <td>{amount(line.projectedQuantity)}</td>
                            <td>{label(line.valuationMethod)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
              {data.hasLaterMovements && (
                <div className="grn-reversal-warning">
                  Later inventory movements exist. Historical COGS will remain
                  unchanged and any value difference will be recorded as a GRN
                  reversal variance.
                </div>
              )}
              {data.negativeStockLineCount > 0 && (
                <div className="error-box grn-reversal-negative" role="alert">
                  <strong>
                    This reversal will create negative inventory for one or more
                    products. Explicit confirmation is required.
                  </strong>
                  <ul>
                    {data.lines
                      .filter((line) => line.createsNegativeStock)
                      .map((line) => (
                        <li key={line.goodsReceiptLineId}>
                          {productLabel(line)}:{" "}
                          {amount(line.projectedQuantity)}
                        </li>
                      ))}
                  </ul>
                  <label>
                    <input
                      type="checkbox"
                      checked={negativeConfirmed}
                      disabled={reverse.isPending}
                      onChange={(event) =>
                        setNegativeConfirmed(event.target.checked)
                      }
                    />{" "}
                    I understand that this reversal will create negative stock.
                  </label>
                </div>
              )}
              {data.purchaseOrderImpact && (
                <section className="direct-grn-card">
                  <h2>Purchase Order impact</h2>
                  <p>
                    Status: {label(data.purchaseOrderImpact.statusBefore)} →{" "}
                    {label(data.purchaseOrderImpact.statusAfter)}
                  </p>
                  <div className="table-wrap">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Product / SKU</th>
                          <th>Ordered qty</th>
                          <th>Received before</th>
                          <th>Reversal qty</th>
                          <th>Received after</th>
                          <th>Status after</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.purchaseOrderImpact.lines.map((line) => (
                          <tr key={line.purchaseOrderLineId}>
                            <td><strong>{productLabel(line)}</strong></td>
                            <td>{amount(line.orderedQty)}</td>
                            <td>{amount(line.receivedQtyBefore)}</td>
                            <td>{amount(line.reversalQty)}</td>
                            <td>{amount(line.receivedQtyAfter)}</td>
                            <td>{label(line.statusAfter)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
              <section className="direct-grn-card">
                <h2>Reversal Details</h2>
                <label className="field">
                  <span>
                    Reversal reason <span className="required">*</span>
                  </span>
                  <textarea
                    className="control"
                    required
                    maxLength={1000}
                    rows={4}
                    value={reason}
                    disabled={reverse.isPending}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Explain why this complete receipt must be reversed"
                  />
                </label>
                <small>{reason.length}/1000</small>
                <p>
                  The original GRN and ledger history will remain available for
                  audit.
                </p>
              </section>
            </>
          )}
          {reverse.error && (
            <div className="error-box" role="alert">
              {reverse.error.message}
            </div>
          )}
        </div>
        <aside
          className="direct-summary-card grn-reversal-summary"
          aria-label="Reversal summary"
        >
          <div>
            <span className="direct-summary-icon">#</span>
            {data?.lines.length ?? 0} lines
          </div>
          <div>
            <span className="direct-summary-icon">◇</span>
            {amount(data?.totalReceivedUnits ?? "0")} received units
          </div>
          <hr />
          <strong>Original GRN total</strong>
          <b>
            {currency} {amount(data?.originalDocumentValue ?? "0")}
          </b>
          <hr />
          <strong>Inventory relief value</strong>
          <p>
            {currency} {amount(data?.inventoryReliefValue ?? "0")}
          </p>
          <strong>Reversal variance</strong>
          <p>
            {currency} {amount(data?.costVariance ?? "0")}
          </p>
          {Boolean(data?.negativeStockLineCount) && (
            <p className="grn-negative-count">
              {data?.negativeStockLineCount} negative-stock lines
            </p>
          )}
        </aside>
      </div>
      <footer className="direct-grn-actions">
        <button
          className="btn btn-secondary"
          disabled={reverse.isPending}
          onClick={() => navigate("/goods-receipts")}
        >
          Cancel
        </button>
        <button
          className="btn btn-secondary"
          disabled={!selected || reverse.isPending}
          onClick={() => select("")}
        >
          Clear Selection
        </button>
        <button
          className="btn btn-danger-soft"
          disabled={!canReverse}
          onClick={() => setConfirmOpen(true)}
        >
          {reverse.isPending ? "Reversing…" : "Reverse GRN"}
        </button>
      </footer>
      <Modal
        open={confirmOpen}
        title="Reverse this posted GRN?"
        onClose={() => !reverse.isPending && setConfirmOpen(false)}
      >
        <div className="modal-body">
          <p>
            This will create compensating inventory movements, update the
            original GRN to Reversed, and cannot be undone.
          </p>
          {receipt?.receiptType === "PO_BASED" && (
            <p>
              The linked Purchase Order received quantities and status will also
              be recalculated.
            </p>
          )}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            disabled={reverse.isPending}
            onClick={() => setConfirmOpen(false)}
          >
            Keep reviewing
          </button>
          <button
            className="btn btn-danger-soft"
            disabled={!canReverse}
            onClick={() => reverse.mutate()}
          >
            {reverse.isPending ? "Reversing…" : "Reverse GRN"}
          </button>
        </div>
      </Modal>
      <Modal
        open={changeSelection !== null}
        title="Discard reversal details?"
        onClose={() => setChangeSelection(null)}
      >
        <div className="modal-body">
          <p>
            Your entered reason and negative-stock confirmation will be cleared.
          </p>
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={() => setChangeSelection(null)}
          >
            Keep reviewing
          </button>
          <button
            className="btn btn-danger-soft"
            onClick={() => {
              reverse.reset();
              setParams(
                changeSelection ? { goodsReceiptId: changeSelection } : {},
              );
              setChangeSelection(null);
              setReason("");
              setNegativeConfirmed(false);
            }}
          >
            Discard details
          </button>
        </div>
      </Modal>
    </div>
  );
}
