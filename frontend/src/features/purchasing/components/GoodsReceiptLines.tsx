import { Field } from "../../../components/ui/Field";
type Props = {
  lines: any[];
  products: any[];
  poBased: boolean;
  supplierId: string;
  receiptDate: string;
  currencyCode: string;
  onChange: (lines: any[]) => void;
};
const empty = {
  productId: "",
  productUnitId: "",
  unitId: "",
  sourceSupplierPriceId: undefined,
  receivedQty: "1",
  unitCost: "0",
  discountAmount: "0",
  taxAmount: "0",
  batchNumber: "",
  manufactureDate: "",
  expiryDate: "",
};
const num = (x: any) => Number(x || 0);
export const grnNet = (x: any) =>
  num(x.unitCost) - num(x.discountAmount) + num(x.taxAmount);
export const grnTotal = (x: any) => num(x.receivedQty) * grnNet(x);
export function GoodsReceiptLines({
  lines,
  products,
  poBased,
  supplierId,
  receiptDate,
  currencyCode,
  onChange,
}: Props) {
  const priceFor = (product: any, productUnitId: string) => {
    const link = (product?.productSuppliers ?? []).find((candidate: any) => String(candidate.supplierId) === String(supplierId) && candidate.isActive !== false);
    const supplierUnit = (link?.supplierUnits ?? []).find((unit: any) => unit.isActive !== false && String(unit.productUnitId) === productUnitId);
    return (supplierUnit?.prices ?? [])
      .filter((price: any) => Number(price.minimumQuantity) === 1 && price.currencyCode === String(currencyCode || "LKR").toUpperCase() && price.isActive !== false && price.effectiveFrom <= receiptDate && (!price.effectiveTo || price.effectiveTo >= receiptDate))
      .sort((a: any, b: any) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0];
  };
  const update = (i: number, k: string, v: string) =>
    onChange(
      lines.map((line, n) => {
        if (n !== i) return line;
        if (k === "productId") {
          const p = products.find((x) => String(x.productId) === v);
          const link = (p?.productSuppliers ?? []).find((candidate: any) => String(candidate.supplierId) === String(supplierId) && candidate.isActive !== false);
          const supplierUnit = (link?.supplierUnits ?? []).find((unit: any) => unit.isActive !== false && unit.isDefaultPurchaseUnit) ?? (link?.supplierUnits ?? []).find((unit: any) => unit.isActive !== false);
          const productUnit = (p?.productUnits ?? []).find((unit: any) => Number(unit.productUnitId) === Number(supplierUnit?.productUnitId));
          const productUnitId = String(productUnit?.productUnitId ?? "");
          const price = priceFor(p, productUnitId);
          return { ...line, productId: v, productUnitId, unitId: String(productUnit?.unitId ?? ""), unitCost: price ? String(price.purchasePrice) : line.unitCost, sourceSupplierPriceId: price?.productSupplierPriceId };
        }
        if (k === "productUnitId") {
          const product = products.find((x) => String(x.productId) === String(line.productId));
          const productUnit = (product?.productUnits ?? []).find((unit: any) => String(unit.productUnitId) === v);
          const price = priceFor(product, v);
          return { ...line, productUnitId: v, unitId: String(productUnit?.unitId ?? ""), unitCost: price ? String(price.purchasePrice) : line.unitCost, sourceSupplierPriceId: price?.productSupplierPriceId };
        }
        return { ...line, [k]: v };
      }),
    );
  const add = () => onChange([...lines, { ...empty }]);
  return (
    <section className="purchase-section">
      <div className="section-title">
        <h3>Receipt items</h3>
        <p>
          {poBased
            ? "Enter the quantity received for each remaining PO line."
            : "Add products received from the selected supplier."}
        </p>
      </div>
      <div className="purchase-grid-wrap">
        <table className="purchase-grid grn-grid">
          <thead>
            <tr>
              <th>Product</th>
              <th>Unit</th>
              {poBased && (
                <>
                  <th>Ordered</th>
                  <th>Received</th>
                  <th>Remaining</th>
                </>
              )}
              <th>Receiving qty</th>
              <th>Unit cost</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Line total</th>
              {!poBased && (
                <>
                  <th>Batch</th>
                  <th>Mfg date</th>
                  <th>Expiry date</th>
                </>
              )}
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => {
              const remaining =
                num(line.orderedQty) - num(line.previouslyReceivedQty);
              return (
                <tr key={i}>
                  <td>
                    {poBased ? (
                      <span>{line.productName || line.productId}</span>
                    ) : (
                      <Field
                        label=""
                        value={line.productId}
                        onChange={(v) => update(i, "productId", v)}
                        required
                        options={products.map((x) => ({
                          value: x.productId,
                          label: `${x.sku} — ${x.productName}`,
                        }))}
                      />
                    )}
                  </td>
                  <td>{poBased ? (line.productUnit?.unit?.code ?? line.unitId) : <Field label="" value={line.productUnitId} onChange={(v) => update(i, "productUnitId", v)} required options={((products.find((x) => String(x.productId) === String(line.productId))?.productUnits) ?? []).filter((unit: any) => unit.isActive !== false && unit.isPurchaseUnit).map((unit: any) => ({ value: unit.productUnitId, label: `${unit.unit?.code ?? unit.unit?.name ?? unit.unitId} × ${unit.conversionFactor}` }))} />}</td>
                  {poBased && (
                    <>
                      <td>{line.orderedQty}</td>
                      <td>{line.previouslyReceivedQty}</td>
                      <td>{remaining}</td>
                    </>
                  )}
                  <td>
                    <Field
                      label=""
                      type="number"
                      value={line.receivedQty}
                      onChange={(v) => update(i, "receivedQty", v)}
                      disabled={false}
                    />
                  </td>
                  <td>
                    <Field
                      label=""
                      type="number"
                      value={line.unitCost}
                      onChange={(v) => update(i, "unitCost", v)}
                    />
                  </td>
                  <td>
                    <Field
                      label=""
                      type="number"
                      value={line.discountAmount}
                      onChange={(v) => update(i, "discountAmount", v)}
                    />
                  </td>
                  <td>
                    <Field
                      label=""
                      type="number"
                      value={line.taxAmount}
                      onChange={(v) => update(i, "taxAmount", v)}
                    />
                  </td>
                  <td className="right">{grnTotal(line).toFixed(2)}</td>
                  {!poBased && (
                    <>
                      <td>
                        <Field
                          label=""
                          value={line.batchNumber}
                          onChange={(v) => update(i, "batchNumber", v)}
                        />
                      </td>
                      <td>
                        <Field
                          label=""
                          type="date"
                          value={line.manufactureDate}
                          onChange={(v) => update(i, "manufactureDate", v)}
                        />
                      </td>
                      <td>
                        <Field
                          label=""
                          type="date"
                          value={line.expiryDate}
                          onChange={(v) => update(i, "expiryDate", v)}
                        />
                      </td>
                    </>
                  )}
                  <td>
                    {!poBased && (
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() =>
                          onChange(lines.filter((_, n) => n !== i))
                        }
                        disabled={lines.length === 1}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!poBased && (
        <button type="button" className="btn btn-secondary" onClick={add}>
          + Add Product
        </button>
      )}
    </section>
  );
}
