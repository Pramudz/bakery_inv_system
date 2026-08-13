import { Field } from "../../../components/ui/Field";
type Props = {
  lines: any[];
  products: any[];
  onChange: (lines: any[]) => void;
};
const emptyLine = {
  productId: "",
  unitId: "",
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
export function PurchaseOrderLines({ lines, products, onChange }: Props) {
  const update = (index: number, key: string, value: string) =>
    onChange(
      lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        if (key === "productId") {
          const product = products.find((x) => String(x.productId) === value);
          return {
            ...line,
            productId: value,
            unitId: String(product?.baseUnitId ?? ""),
          };
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
                  <span className="unit-readonly">
                    {line.unitId || "Select product"}
                  </span>
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
