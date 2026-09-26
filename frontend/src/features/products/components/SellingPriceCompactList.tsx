import { PriceItemDiscountControls } from "./PriceItemDiscountControls";

const money = (currency: string, value: string | number) =>
  `${currency || "LKR"} ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
const compactNumber = (value: string | number) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
const shortDate = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(value))
    : "Open ended";

type Props = {
  summary: any[];
  expandedPriceItemId: number | null;
  rowBusyId: number | null;
  unitsDirty: boolean;
  productName: string;
  sku: string;
  onToggle: (priceListItemId: number) => void;
  onChangePrice: (group: any, scheduled?: boolean) => void;
  onEndPrice: (group: any) => void;
  onCancelFuture: (group: any) => void;
  onPriceHistory: (group: any) => void;
  onRefresh: (priceListItemId: number) => void;
  onError: (message: string) => void;
};

export function SellingPriceCompactList({
  summary,
  expandedPriceItemId,
  rowBusyId,
  unitsDirty,
  productName,
  sku,
  onToggle,
  onChangePrice,
  onEndPrice,
  onCancelFuture,
  onPriceHistory,
  onRefresh,
  onError,
}: Props) {
  const rows = summary.filter((group) => group.current);

  return (
    <div className="selling-compact-list">
      <div className="selling-compact-head">
        <span>Price List &amp; Unit</span>
        <span>Base Price</span>
        <span>Discount</span>
        <span>Final Price</span>
        <span>Status</span>
        <span aria-hidden="true" />
      </div>
      {rows.map((group) => {
        const price = group.current;
        const priceItemId = Number(price.priceListItemId);
        const expanded = expandedPriceItemId === priceItemId;
        const currentDiscount = price.currentDiscount?.status === "CURRENT"
          ? price.currentDiscount
          : null;
        const scheduledDiscount = price.currentDiscount?.status === "FUTURE"
          ? price.currentDiscount
          : null;
        const discountLabel = currentDiscount
          ? currentDiscount.discountType === "PERCENTAGE"
            ? `${compactNumber(currentDiscount.discountValue)}% off`
            : `${money(price.currencyCode, currentDiscount.discountValue)} off`
          : "No discount";
        const toggle = () => onToggle(priceItemId);

        return (
          <div className={`selling-compact-item${expanded ? " expanded" : ""}`} key={priceItemId}>
            <div
              className="selling-compact-summary"
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={toggle}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  toggle();
                }
              }}
            >
              <div className="selling-list-cell selling-list-identity">
                <span className="selling-chevron" aria-hidden="true">{expanded ? "⌄" : "›"}</span>
                <span>
                  <strong className="selling-list-badge">{group.priceList.name}</strong>
                  <small>{group.productUnit?.unit?.name ?? "—"}</small>
                </span>
              </div>
              <div className="selling-list-cell">
                <strong>{money(price.currencyCode, price.sellingPrice)}</strong>
                <small>From {shortDate(price.effectiveFrom)}</small>
              </div>
              <div className="selling-list-cell">
                {currentDiscount ? (
                  <><strong className="selling-discount-badge">{discountLabel}</strong><small>{currentDiscount.effectiveTo ? `Ends ${shortDate(currentDiscount.effectiveTo)}` : "Open ended"}</small></>
                ) : <span>No discount</span>}
              </div>
              <div className="selling-list-cell">
                <strong className="selling-final-price">{money(price.currencyCode, price.finalUnitPrice ?? price.sellingPrice)}</strong>
                {currentDiscount && <small className="selling-saving">Save {money(price.currencyCode, currentDiscount.discountAmount ?? 0)}</small>}
              </div>
              <div className="selling-list-cell"><strong className="selling-status-badge">Active</strong></div>
              <span className="selling-manage-label">{rowBusyId === priceItemId ? "Refreshing…" : "Manage"}</span>
            </div>

            {expanded && (
              <div className="selling-expanded" onClick={(event) => event.stopPropagation()}>
                <div className="selling-expanded-columns">
                  <div className="selling-expanded-column">
                    <h4>Current Price</h4>
                    <strong>{money(price.currencyCode, price.sellingPrice)}</strong>
                    <p>Effective {shortDate(price.effectiveFrom)} · {price.effectiveTo ? `Ends ${shortDate(price.effectiveTo)}` : "Open ended"}</p>
                    <div className="selling-upcoming-actions">
                      <button type="button" className="btn btn-secondary btn-compact" disabled={unitsDirty} onClick={() => onChangePrice(group)}>✎ Change Price</button>
                      <button type="button" className="btn btn-ghost btn-compact" disabled={unitsDirty} onClick={() => onEndPrice(group)}>End Price</button>
                    </div>
                  </div>
                  <div className="selling-expanded-column">
                    <h4>Current Discount</h4>
                    {currentDiscount ? (
                      <><strong>{currentDiscount.discountType === "PERCENTAGE" ? `${compactNumber(currentDiscount.discountValue)}% Percentage` : `${money(price.currencyCode, currentDiscount.discountValue)} Fixed Amount`}</strong><p>{shortDate(currentDiscount.effectiveFrom)}–{currentDiscount.effectiveTo ? shortDate(currentDiscount.effectiveTo) : "Open ended"}</p></>
                    ) : <><strong>No discount</strong><p>Customer pays the base price.</p></>}
                    <PriceItemDiscountControls variant="current" group={group} productName={productName} sku={sku} onChanged={() => onRefresh(priceItemId)} onError={onError} />
                  </div>
                  <div className="selling-expanded-column">
                    <h4>Upcoming</h4>
                    {group.nextScheduled && <p><strong>{money(group.nextScheduled.currencyCode, group.nextScheduled.sellingPrice)}</strong><br />Price from {shortDate(group.nextScheduled.effectiveFrom)} <button type="button" className="link-button" onClick={() => onCancelFuture(group)}>Cancel</button></p>}
                    {scheduledDiscount && <p><strong>{scheduledDiscount.discountType === "PERCENTAGE" ? `${compactNumber(scheduledDiscount.discountValue)}% discount` : `${money(price.currencyCode, scheduledDiscount.discountValue)} discount`}</strong><br />From {shortDate(scheduledDiscount.effectiveFrom)}</p>}
                    {!group.nextScheduled && !scheduledDiscount && <p>No scheduled changes</p>}
                    <div className="selling-upcoming-actions">
                      <button type="button" className="btn btn-secondary btn-compact" disabled={unitsDirty} onClick={() => onChangePrice(group, true)}>+ Schedule Price</button>
                      <PriceItemDiscountControls variant="schedule" group={group} productName={productName} sku={sku} onChanged={() => onRefresh(priceItemId)} onError={onError} />
                    </div>
                  </div>
                </div>
                <div className="selling-expanded-note">ⓘ Changing the base price ends its attached discount.</div>
                <div className="selling-expanded-history">
                  <button type="button" className="link-button" onClick={() => onPriceHistory(group)}>◷ Price History</button>
                  <span aria-hidden="true">|</span>
                  <PriceItemDiscountControls variant="history" group={group} productName={productName} sku={sku} onChanged={() => onRefresh(priceItemId)} onError={onError} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {!rows.length && <div className="empty">No published selling prices.</div>}
    </div>
  );
}
