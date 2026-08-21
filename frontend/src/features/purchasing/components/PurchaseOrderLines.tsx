import { Field } from "../../../components/ui/Field";
type Props = {
  lines: any[];
  products: any[];
  supplierId: string;
  orderDate: string;
  currencyCode: string;
  onChange: (lines: any[]) => void;
};
const emptyLine = {
  productId: "",
  productUnitId: "",
  unitId: "",
  sourceSupplierPriceId: undefined,
  orderedQty: "1",
  unitCost: "0",
  discountAmount: "0",
  taxAmount: "0",
};
const numeric = (value: unknown) => Number(value || 0);
export const poNet = (line: any) =>
  numeric(line.unitCost) -
  numeric(line.discountAmount) +
  numeric(line.taxAmount);
export const poLineTotal = (line: any) =>
  numeric(line.orderedQty) * poNet(line);
export function PurchaseOrderLines({ lines, products, supplierId, orderDate, currencyCode, onChange }: Props) {
  const priceFor = (product: any, productUnitId: string) => {
    const link = (product?.productSuppliers ?? []).find((candidate: any) => String(candidate.supplierId) === String(supplierId) && candidate.isActive !== false);
    const supplierUnit = (link?.supplierUnits ?? []).find((unit: any) => unit.isActive !== false && String(unit.productUnitId) === productUnitId);
    return (supplierUnit?.prices ?? [])
      .filter((price: any) => Number(price.minimumQuantity) === 1 && price.currencyCode === String(currencyCode || "LKR").toUpperCase() && price.isActive !== false && price.effectiveFrom <= orderDate && (!price.effectiveTo || price.effectiveTo >= orderDate))
      .sort((a: any, b: any) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)))[0];
  };
  const update = (index: number, key: string, value: string) =>
    onChange(
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (key === "productId") {
          const product = products.find((x) => String(x.productId) === value);
          const link = (product?.productSuppliers ?? []).find((candidate: any) => String(candidate.supplierId) === String(supplierId) && candidate.isActive !== false);
          const supplierUnit = (link?.supplierUnits ?? []).find((unit: any) => unit.isActive !== false && unit.isDefaultPurchaseUnit) ?? (link?.supplierUnits ?? []).find((unit: any) => unit.isActive !== false);
          const productUnit = (product?.productUnits ?? []).find((unit: any) => Number(unit.productUnitId) === Number(supplierUnit?.productUnitId));
          const productUnitId = String(productUnit?.productUnitId ?? "");
          const price = priceFor(product, productUnitId);
          return {
            ...line,
            productId: value,
            productUnitId,
            unitId: String(productUnit?.unitId ?? ""),
            unitCost: price ? String(price.purchasePrice) : line.unitCost,
            sourceSupplierPriceId: price?.productSupplierPriceId,
          };
        }
        if (key === "productUnitId") {
          const product = products.find((x) => String(x.productId) === String(line.productId));
          const productUnit = (product?.productUnits ?? []).find((unit: any) => String(unit.productUnitId) === value);
          const price = priceFor(product, value);
          return { ...line, productUnitId: value, unitId: String(productUnit?.unitId ?? ""), unitCost: price ? String(price.purchasePrice) : line.unitCost, sourceSupplierPriceId: price?.productSupplierPriceId };
        }
        return { ...line, [key]: value };
      }),
    );
  const add = () => onChange([...lines, { ...emptyLine }]);
  return (
    <section className="purchase-section">
      <div className="section-title">
        <h3>Order items</h3>
        <p>Add one or more products to the purchase order.</p>
      </div>
      <div className="purchase-grid-wrap">
        <table className="purchase-grid">
          <thead>
            <tr>
              <th>Product</th>
              <th>Unit</th>
              <th>Ordered qty</th>
              <th>Unit cost</th>
              <th>Discount</th>
              <th>Tax</th>
              <th>Net cost</th>
              <th>Line total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <Field
                    label=""
                    value={line.productId}
                    onChange={(v) => update(index, "productId", v)}
                    options={products.map((x) => ({
                      value: x.productId,
                      label: `${x.sku} — ${x.productName}`,
                    }))}
                    required
                  />
                </td>
                <td>
                  <Field label="" value={line.productUnitId} onChange={(v) => update(index, "productUnitId", v)} required options={((products.find((x) => String(x.productId) === String(line.productId))?.productUnits) ?? []).filter((unit: any) => unit.isActive !== false && unit.isPurchaseUnit).map((unit: any) => ({ value: unit.productUnitId, label: `${unit.unit?.code ?? unit.unit?.name ?? unit.unitId} × ${unit.conversionFactor}` }))} />
                </td>
                <td>
                  <Field
                    label=""
                    type="number"
                    value={line.orderedQty}
                    onChange={(v) => update(index, "orderedQty", v)}
                    required
                  />
                </td>
                <td>
                  <Field
                    label=""
                    type="number"
                    value={line.unitCost}
                    onChange={(v) => update(index, "unitCost", v)}
                    required
                  />
                </td>
                <td>
                  <Field
                    label=""
                    type="number"
                    value={line.discountAmount}
                    onChange={(v) => update(index, "discountAmount", v)}
                  />
                </td>
                <td>
                  <Field
                    label=""
                    type="number"
                    value={line.taxAmount}
                    onChange={(v) => update(index, "taxAmount", v)}
                  />
                </td>
                <td className="right">{poNet(line).toFixed(2)}</td>
                <td className="right">{poLineTotal(line).toFixed(2)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() =>
                      onChange(
                        lines.filter((_, lineIndex) => lineIndex !== index),
                      )
                    }
                    disabled={lines.length === 1}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-secondary" onClick={add}>
        + Add Product
      </button>
    </section>
  );
}
