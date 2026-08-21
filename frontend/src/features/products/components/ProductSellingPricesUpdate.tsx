import { useEffect, useMemo, useState } from "react";
import { Modal } from "../../../components/ui/Modal";
import { Field } from "../../../components/ui/Field";
import {
  productsApi,
  type SellingPriceHistoryPage,
  type SellingPriceSummary,
} from "../api/productsApi";

type ProductUnitOption = {
  productUnitId?: number;
  unitId: string;
  isBaseUnit: boolean;
  isSalesUnit: boolean;
  isActive: boolean;
};
type Option = { value: string | number; label: string; currencyCode?: string };
type DraftKind =
  "ADD_INITIAL_PRICE" | "CHANGE_PRICE" | "END_PRICE" | "CANCEL_FUTURE_PRICE";
type Draft = {
  id: string;
  action: DraftKind;
  priceListItemId?: number;
  priceListId: number;
  productUnitId: number;
  priceListLabel: string;
  unitLabel: string;
  currentPrice?: string;
  currencyCode?: string;
  price?: number;
  effectiveMode?: "NOW" | "SCHEDULED";
  effectiveFrom?: string;
  effectiveTo?: string;
};
type Editor = {
  kind: "ADD" | "CHANGE" | "END";
  group?: SellingPriceSummary;
  draftIndex?: number;
};

const money = (currency: string, value: string | number) =>
  `${currency || "LKR"} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateTime = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
const localInput = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

export function ProductSellingPricesUpdate({
  productId,
  productUnits,
  priceListOptions,
  unitOptions,
  unitsDirty,
}: {
  productId: number;
  productUnits: ProductUnitOption[];
  priceListOptions: Option[];
  unitOptions: Option[];
  unitsDirty: boolean;
}) {
  const [summary, setSummary] = useState<SellingPriceSummary[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState({
    priceListId: "",
    productUnitId: "",
    price: "",
    effectiveMode: "NOW",
    effectiveFrom: "",
    effectiveTo: "",
  });
  const [publishOpen, setPublishOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<SellingPriceHistoryPage | null>(null);
  const [historyFilters, setHistoryFilters] = useState({
    page: 1,
    priceListId: "",
    productUnitId: "",
    status: "",
    fromDate: "",
    toDate: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const activeSalesUnits = useMemo(
    () =>
      productUnits
        .filter(
          (unit) =>
            unit.productUnitId &&
            unit.isActive &&
            unit.isBaseUnit &&
            unit.isSalesUnit,
        )
        .map((unit) => ({
          value: unit.productUnitId!,
          label:
            unitOptions.find((option) => String(option.value) === unit.unitId)
              ?.label ?? "Configured sales unit",
        })),
    [productUnits, unitOptions],
  );

  const refreshSummary = async () => {
    setBusy(true);
    setError("");
    try {
      setSummary(await productsApi.sellingPriceSummary(productId));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refreshSummary();
  }, [productId]);

  useEffect(() => {
    if (!historyOpen) return;
    let active = true;
    setBusy(true);
    setError("");
    productsApi
      .sellingPriceHistory(productId, { ...historyFilters, limit: 25 })
      .then((result) => {
        if (active) setHistory(result);
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [historyOpen, productId, historyFilters]);

  const openAdd = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setForm({
      priceListId: "",
      productUnitId: String(activeSalesUnits[0]?.value ?? ""),
      price: "",
      effectiveMode: "NOW",
      effectiveFrom: localInput(tomorrow),
      effectiveTo: "",
    });
    setEditor({ kind: "ADD" });
    setError("");
  };
  const openChange = (group: SellingPriceSummary) => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setForm({
      priceListId: String(group.priceListId),
      productUnitId: String(group.productUnitId),
      price: "",
      effectiveMode: "NOW",
      effectiveFrom: localInput(tomorrow),
      effectiveTo: "",
    });
    setEditor({ kind: "CHANGE", group });
    setError("");
  };
  const openEnd = (group: SellingPriceSummary) => {
    const initialEnd = new Date();
    initialEnd.setMinutes(initialEnd.getMinutes() + 5);
    setForm({
      priceListId: String(group.priceListId),
      productUnitId: String(group.productUnitId),
      price: "",
      effectiveMode: "NOW",
      effectiveFrom: "",
      effectiveTo: localInput(initialEnd),
    });
    setEditor({ kind: "END", group });
    setError("");
  };
  const editDraft = (draft: Draft, draftIndex: number) => {
    const group = summary.find(
      (row) =>
        Number(row.priceListId) === draft.priceListId &&
        Number(row.productUnitId) === draft.productUnitId,
    );
    setForm({
      priceListId: String(draft.priceListId),
      productUnitId: String(draft.productUnitId),
      price: draft.price == null ? "" : String(draft.price),
      effectiveMode: draft.effectiveMode ?? "NOW",
      effectiveFrom: draft.effectiveFrom
        ? localInput(new Date(draft.effectiveFrom))
        : "",
      effectiveTo: draft.effectiveTo
        ? localInput(new Date(draft.effectiveTo))
        : "",
    });
    setEditor({
      kind:
        draft.action === "ADD_INITIAL_PRICE"
          ? "ADD"
          : draft.action === "CHANGE_PRICE"
            ? "CHANGE"
            : "END",
      group,
      draftIndex,
    });
  };
  const saveDraft = () => {
    if (!editor) return;
    const priceListId = Number(form.priceListId || editor.group?.priceListId);
    const productUnitId = Number(
      form.productUnitId || editor.group?.productUnitId,
    );
    const listLabel =
      priceListOptions.find((option) => Number(option.value) === priceListId)
        ?.label ??
      editor.group?.priceList?.name ??
      "Price List";
    const unitLabel =
      activeSalesUnits.find((option) => Number(option.value) === productUnitId)
        ?.label ??
      editor.group?.productUnit?.unit?.name ??
      "Unit";
    if (!priceListId || !productUnitId) {
      setError("Price List and the active base unit are required.");
      return;
    }
    if (editor.kind !== "END" && Number(form.price) <= 0) {
      setError("Price must be greater than zero.");
      return;
    }
    if (
      (form.effectiveMode === "SCHEDULED" && !form.effectiveFrom) ||
      (editor.kind === "END" && !form.effectiveTo)
    ) {
      setError("Select the required effective date and time.");
      return;
    }
    const action: Draft = {
      id:
        editor.draftIndex == null
          ? `${Date.now()}-${Math.random()}`
          : drafts[editor.draftIndex].id,
      action:
        editor.kind === "ADD"
          ? "ADD_INITIAL_PRICE"
          : editor.kind === "CHANGE"
            ? "CHANGE_PRICE"
            : "END_PRICE",
      priceListItemId: editor.group?.current?.priceListItemId,
      priceListId,
      productUnitId,
      priceListLabel: listLabel,
      unitLabel,
      currentPrice: editor.group?.current
        ? money(
            editor.group.current.currencyCode,
            editor.group.current.sellingPrice,
          )
        : undefined,
      currencyCode:
        editor.group?.current?.currencyCode ??
        priceListOptions.find((option) => Number(option.value) === priceListId)
          ?.currencyCode ??
        "LKR",
      price: editor.kind === "END" ? undefined : Number(form.price),
      effectiveMode:
        editor.kind === "END"
          ? undefined
          : (form.effectiveMode as "NOW" | "SCHEDULED"),
      effectiveFrom:
        form.effectiveMode === "SCHEDULED" && form.effectiveFrom
          ? new Date(form.effectiveFrom).toISOString()
          : undefined,
      effectiveTo:
        editor.kind === "END"
          ? new Date(form.effectiveTo).toISOString()
          : undefined,
    };
    const duplicate = drafts.some(
      (draft, index) =>
        index !== editor.draftIndex &&
        ((action.priceListItemId &&
          draft.priceListItemId === action.priceListItemId) ||
          (action.action === "ADD_INITIAL_PRICE" &&
            draft.action === action.action &&
            draft.priceListId === action.priceListId &&
            draft.productUnitId === action.productUnitId)),
    );
    if (duplicate) {
      setError(
        "A draft change already exists for this selling price combination.",
      );
      return;
    }
    setDrafts((rows) =>
      editor.draftIndex == null
        ? [...rows, action]
        : rows.map((draft, index) =>
            index === editor.draftIndex ? action : draft,
          ),
    );
    setEditor(null);
    setError("");
    setSuccess("");
  };
  const cancelFuture = (group: SellingPriceSummary) => {
    if (!group.nextScheduled) return;
    if (
      drafts.some(
        (draft) =>
          draft.priceListItemId === Number(group.nextScheduled.priceListItemId),
      )
    ) {
      setError("A draft already exists for this scheduled price.");
      return;
    }
    setDrafts((rows) => [
      ...rows,
      {
        id: `${Date.now()}-cancel`,
        action: "CANCEL_FUTURE_PRICE",
        priceListItemId: Number(group.nextScheduled.priceListItemId),
        priceListId: Number(group.priceListId),
        productUnitId: Number(group.productUnitId),
        priceListLabel: group.priceList.name,
        unitLabel: group.productUnit?.unit?.name ?? "Unit",
        currentPrice: money(
          group.nextScheduled.currencyCode,
          group.nextScheduled.sellingPrice,
        ),
        effectiveFrom: group.nextScheduled.effectiveFrom,
      },
    ]);
  };
  const publish = async () => {
    if (unitsDirty) {
      setError("Save Product Unit changes before publishing selling prices.");
      setPublishOpen(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const actions = drafts.map((draft) => ({
        action: draft.action,
        priceListItemId: draft.priceListItemId,
        priceListId: draft.priceListId,
        productUnitId: draft.productUnitId,
        price: draft.price,
        effectiveMode: draft.effectiveMode,
        effectiveFrom: draft.effectiveFrom,
        effectiveTo: draft.effectiveTo,
      }));
      setSummary(await productsApi.publishSellingPrices(productId, actions));
      setDrafts([]);
      setPublishOpen(false);
      setSuccess("Selling prices published successfully.");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const proposed = (draft: Draft) =>
    draft.action === "ADD_INITIAL_PRICE"
      ? `Add ${money(draft.currencyCode ?? "LKR", draft.price ?? 0)}`
      : draft.action === "CHANGE_PRICE"
        ? `Change to ${money(draft.currencyCode ?? "LKR", draft.price ?? 0)}`
        : draft.action === "END_PRICE"
          ? "End current price"
          : "Cancel scheduled price";
  const effective = (draft: Draft) =>
    draft.effectiveMode === "NOW"
      ? "On publish (server time)"
      : dateTime(draft.effectiveFrom ?? draft.effectiveTo);

  return (
    <>
      <section className="selling-update-panel">
        <div className="selling-update-head">
          <div>
            <h3>Selling Prices</h3>
            <p>Maintain current and scheduled prices for the product base unit.</p>
            <strong>Unpublished changes: {drafts.length}</strong>
          </div>
          <div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setHistoryOpen(true)}
            >
              View Price History
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!drafts.length || busy || unitsDirty}
              onClick={() => setPublishOpen(true)}
            >
              Publish Prices ({drafts.length})
            </button>
          </div>
        </div>
        {unitsDirty && (
          <div className="warning-box">
            Save Product Unit changes before adding or publishing price changes.
          </div>
        )}
        {success && <div className="success-box">{success}</div>}
        {error && <div className="error-box">{error}</div>}
        <div className="selling-price-toolbar">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={unitsDirty || activeSalesUnits.length !== 1}
            onClick={openAdd}
          >
            + Add Price
          </button>
        </div>
        <div className="selling-summary-table">
          <div className="selling-summary-row head">
            <span>Price List</span>
            <span>Unit</span>
            <span>Current Price</span>
            <span>Effective From</span>
            <span>Effective End</span>
            <span>Next Scheduled</span>
            <span>Actions</span>
          </div>
          {summary.map((group) => (
            <div
              className="selling-summary-row"
              key={`${group.priceListId}-${group.productUnitId}`}
            >
              <strong>{group.priceList.name}</strong>
              <span>{group.productUnit?.unit?.name ?? "—"}</span>
              <strong>
                {group.current
                  ? money(
                      group.current.currencyCode,
                      group.current.sellingPrice,
                    )
                  : "No current price"}
              </strong>
              <span>{dateTime(group.current?.effectiveFrom)}</span>
              <span>{dateTime(group.current?.effectiveTo)}</span>
              <span>
                {group.nextScheduled ? (
                  <>
                    <strong>
                      {money(
                        group.nextScheduled.currencyCode,
                        group.nextScheduled.sellingPrice,
                      )}
                    </strong>
                    <small>{dateTime(group.nextScheduled.effectiveFrom)}</small>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => cancelFuture(group)}
                    >
                      Cancel scheduled
                    </button>
                  </>
                ) : (
                  "—"
                )}
              </span>
              <div className="price-action-stack">
                {group.current && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      disabled={unitsDirty}
                      onClick={() => openChange(group)}
                    >
                      Change Price
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-compact"
                      disabled={unitsDirty}
                      onClick={() => openEnd(group)}
                    >
                      End Price
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!busy && !summary.length && (
            <div className="empty">No published selling prices.</div>
          )}
        </div>
        {drafts.length > 0 && (
          <div className="draft-price-section">
            <h4>Draft Price Changes</h4>
            <div className="draft-price-row head">
              <span>Price List</span>
              <span>Unit</span>
              <span>Proposed Change</span>
              <span>Effective Time</span>
              <span>Actions</span>
            </div>
            {drafts.map((draft, index) => (
              <div className="draft-price-row" key={draft.id}>
                <span>{draft.priceListLabel}</span>
                <span>{draft.unitLabel}</span>
                <strong>{proposed(draft)}</strong>
                <span>
                  {effective(draft)}
                  {draft.action === "END_PRICE" && (
                    <small className="draft-warning">
                      May leave this combination without an active price.
                    </small>
                  )}
                </span>
                <div>
                  {draft.action !== "CANCEL_FUTURE_PRICE" && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => editDraft(draft, index)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-ghost danger-text"
                    onClick={() =>
                      setDrafts((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    Discard
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={
          editor?.kind === "ADD"
            ? "Add Selling Price"
            : editor?.kind === "CHANGE"
              ? "Change Selling Price"
              : "End Selling Price"
        }
      >
        <div className="modal-body">
          <div className="form-grid">
            {editor?.kind === "ADD" ? (
              <>
                <Field
                  label="Price List"
                  value={form.priceListId}
                  onChange={(value) => setForm({ ...form, priceListId: value })}
                  options={priceListOptions}
                  required
                />
                <Field
                  label="Unit"
                  value={activeSalesUnits[0]?.label ?? "Save an active base unit first"}
                  onChange={() => {}}
                  disabled
                />
              </>
            ) : (
              <>
                <Field
                  label="Price List"
                  value={editor?.group?.priceList?.name ?? ""}
                  onChange={() => {}}
                  disabled
                />
                <Field
                  label="Unit"
                  value={editor?.group?.productUnit?.unit?.name ?? ""}
                  onChange={() => {}}
                  disabled
                />
              </>
            )}
            {editor?.kind !== "END" && (
              <Field
                label={editor?.kind === "CHANGE" ? "New Price" : "Price"}
                type="number"
                value={form.price}
                onChange={(value) => setForm({ ...form, price: value })}
                required
              />
            )}
            {editor?.kind === "CHANGE" && (
              <Field
                label="Current Price"
                value={
                  editor.group?.current
                    ? money(
                        editor.group.current.currencyCode,
                        editor.group.current.sellingPrice,
                      )
                    : ""
                }
                onChange={() => {}}
                disabled
              />
            )}
            {editor?.kind !== "END" && (
              <Field
                label="Effective"
                value={form.effectiveMode}
                onChange={(value) => setForm({ ...form, effectiveMode: value })}
                options={[
                  { value: "NOW", label: "Now" },
                  { value: "SCHEDULED", label: "Schedule for later" },
                ]}
                required
              />
            )}
            {editor?.kind !== "END" && form.effectiveMode === "SCHEDULED" && (
              <Field
                label="Effective From"
                type="datetime-local"
                value={form.effectiveFrom}
                onChange={(value) => setForm({ ...form, effectiveFrom: value })}
                required
              />
            )}
            {editor?.kind === "END" && (
              <Field
                label="Effective End"
                type="datetime-local"
                value={form.effectiveTo}
                onChange={(value) => setForm({ ...form, effectiveTo: value })}
                required
              />
            )}
          </div>
          {editor?.kind === "END" && (
            <div className="warning-box">
              This price will not be available for new sales after the selected
              time. Historical transactions are unchanged.
            </div>
          )}
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setEditor(null)}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={saveDraft}>
            Add Draft Change
          </button>
        </div>
      </Modal>

      <Modal
        open={publishOpen}
        onClose={() => !busy && setPublishOpen(false)}
        title="Publish Selling Prices"
        subtitle="All draft actions will publish together or roll back together."
      >
        <div className="modal-body">
          <div className="publish-action-list">
            {drafts.map((draft) => (
              <div key={draft.id}>
                <strong>
                  {draft.priceListLabel} · {draft.unitLabel}
                </strong>
                <span>
                  {proposed(draft)} — {effective(draft)}
                </span>
              </div>
            ))}
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-foot">
          <button
            type="button"
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setPublishOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={publish}
          >
            {busy ? "Publishing..." : `Confirm Publish (${drafts.length})`}
          </button>
        </div>
      </Modal>

      <Modal
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Selling Price History"
        subtitle="Published revisions are read-only."
        wide
      >
        <div className="modal-body">
          <div className="history-filters">
            <Field
              label="Price List"
              value={historyFilters.priceListId}
              onChange={(value) =>
                setHistoryFilters({
                  ...historyFilters,
                  page: 1,
                  priceListId: value,
                })
              }
              options={priceListOptions}
            />
            <Field
              label="Unit"
              value={historyFilters.productUnitId}
              onChange={(value) =>
                setHistoryFilters({
                  ...historyFilters,
                  page: 1,
                  productUnitId: value,
                })
              }
              options={productUnits
                .filter((unit) => unit.productUnitId)
                .map((unit) => ({
                  value: unit.productUnitId!,
                  label:
                    unitOptions.find(
                      (option) => String(option.value) === unit.unitId,
                    )?.label ?? "Product unit",
                }))}
            />
            <Field
              label="Status"
              value={historyFilters.status}
              onChange={(value) =>
                setHistoryFilters({ ...historyFilters, page: 1, status: value })
              }
              options={[
                { value: "CURRENT", label: "Current" },
                { value: "FUTURE", label: "Future" },
                { value: "ENDED", label: "Ended" },
              ]}
            />
            <Field
              label="From Date"
              type="date"
              value={historyFilters.fromDate}
              onChange={(value) =>
                setHistoryFilters({
                  ...historyFilters,
                  page: 1,
                  fromDate: value,
                })
              }
            />
            <Field
              label="To Date"
              type="date"
              value={historyFilters.toDate}
              onChange={(value) =>
                setHistoryFilters({ ...historyFilters, page: 1, toDate: value })
              }
            />
          </div>
          <div className="history-table">
            <div className="history-table-row head">
              <span>Price List</span>
              <span>Unit</span>
              <span>Price</span>
              <span>Effective From</span>
              <span>Effective To</span>
              <span>Status</span>
            </div>
            {history?.items.map((row: any) => (
              <div className="history-table-row" key={row.priceListItemId}>
                <span>{row.priceList?.name}</span>
                <span>{row.productUnit?.unit?.name}</span>
                <strong>{money(row.currencyCode, row.sellingPrice)}</strong>
                <span>{dateTime(row.effectiveFrom)}</span>
                <span>{dateTime(row.effectiveTo)}</span>
                <span
                  className={
                    row.status === "CURRENT"
                      ? "status status-on"
                      : row.status === "FUTURE"
                        ? "status status-warn"
                        : "status status-off"
                  }
                >
                  {row.status === "ENDED"
                    ? "Ended"
                    : row.status === "FUTURE"
                      ? "Future"
                      : "Current"}
                </span>
              </div>
            ))}
          </div>
          <div className="history-pagination">
            <span>{history?.totalItems ?? 0} revisions</span>
            <div>
              <button
                className="btn btn-secondary"
                disabled={(history?.page ?? 1) <= 1 || busy}
                onClick={() =>
                  setHistoryFilters({
                    ...historyFilters,
                    page: historyFilters.page - 1,
                  })
                }
              >
                Previous
              </button>
              <span>
                Page {history?.page ?? 1} of {history?.totalPages ?? 1}
              </span>
              <button
                className="btn btn-secondary"
                disabled={
                  (history?.page ?? 1) >= (history?.totalPages ?? 1) || busy
                }
                onClick={() =>
                  setHistoryFilters({
                    ...historyFilters,
                    page: historyFilters.page + 1,
                  })
                }
              >
                Next
              </button>
            </div>
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>
        <div className="modal-foot">
          <button
            className="btn btn-secondary"
            onClick={() => setHistoryOpen(false)}
          >
            Close
          </button>
        </div>
      </Modal>
    </>
  );
}
