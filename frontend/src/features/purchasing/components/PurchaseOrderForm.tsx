import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../../components/ui/Modal";
import { Field } from "../../../components/ui/Field";
import { useAuth } from "../../auth/AuthContext";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { locationsApi } from "../../locations/api/locationsApi";
import { productsApi } from "../../products/api/productsApi";
import { purchasingApi } from "../api/purchasingApi";
import { poLineTotal, PurchaseOrderLines } from "./PurchaseOrderLines";
const today = new Date().toISOString().slice(0, 10);
const blank = {
  productId: "",
  unitId: "",
  orderedQty: "1",
  unitCost: "0",
  discountAmount: "0",
  taxAmount: "0",
};
export function PurchaseOrderForm({
  close,
  initial,
}: {
  close: () => void;
  initial?: any;
}) {
  const { permissions } = useAuth();
  const client = useQueryClient();
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
  const [form, setForm] = useState<any>(
    initial
      ? {
          ...initial,
          lines: initial.lines?.length ? initial.lines : [{ ...blank }],
        }
      : {
          poNumber: "",
          supplierId: "",
          locationId: "",
          orderDate: today,
          expectedDate: "",
          currencyCode: "LKR",
          notes: "",
          lines: [{ ...blank }],
        },
  );
  const save = useMutation({
    mutationFn: (data: any) =>
      initial
        ? purchasingApi.updateOrder(initial.purchaseOrderId, data)
        : purchasingApi.createOrder(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["purchase-orders"] });
      close();
    },
  });
  const subtotal = form.lines.reduce(
    (sum: number, line: any) =>
      sum + Number(line.orderedQty || 0) * Number(line.unitCost || 0),
    0,
  );
  const discount = form.lines.reduce(
    (sum: number, line: any) =>
      sum + Number(line.orderedQty || 0) * Number(line.discountAmount || 0),
    0,
  );
  const tax = form.lines.reduce(
    (sum: number, line: any) =>
      sum + Number(line.orderedQty || 0) * Number(line.taxAmount || 0),
    0,
  );
  const total = form.lines.reduce(
    (sum: number, line: any) => sum + poLineTotal(line),
    0,
  );
  const editable = !initial || initial.status === "DRAFT";
  return (
    <Modal
      open
      title={
        initial
          ? `Edit Purchase Order — ${initial.poNumber}`
          : "Create Purchase Order"
      }
      subtitle="Supplier and location are restricted to your authenticated tenant."
      onClose={close}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(form);
        }}
      >
        <div className="modal-body purchase-modal-body">
          <section className="purchase-section">
            <div className="section-title">
              <h3>Order header</h3>
              <p>Capture supplier, delivery and currency information.</p>
            </div>
            <div className="form-grid">
              <Field
                label="PO Number"
                value={form.poNumber}
                onChange={(v) => setForm({ ...form, poNumber: v })}
                required
                disabled={!editable}
              />
              <Field
                label="Supplier"
                value={form.supplierId}
                onChange={(v) => setForm({ ...form, supplierId: v })}
                required
                disabled={!editable}
                options={(suppliers.data ?? []).map((x: any) => ({
                  value: x.supplierId,
                  label: `${x.supplierCode} — ${x.supplierName}`,
                }))}
              />
              <Field
                label="Receiving Location"
                value={form.locationId}
                onChange={(v) => setForm({ ...form, locationId: v })}
                required
                disabled={!editable}
                options={(locations.data ?? []).map((x: any) => ({
                  value: x.locationId,
                  label: `${x.code} — ${x.name}`,
                }))}
              />
              <Field
                label="Order Date"
                type="date"
                value={form.orderDate}
                onChange={(v) => setForm({ ...form, orderDate: v })}
                required
                disabled={!editable}
              />
              <Field
                label="Expected Date"
                type="date"
                value={form.expectedDate}
                onChange={(v) => setForm({ ...form, expectedDate: v })}
                disabled={!editable}
              />
              <Field
                label="Currency"
                value={form.currencyCode}
                onChange={(v) => setForm({ ...form, currencyCode: v })}
                required
                disabled={!editable}
              />
              <Field
                label="Notes"
                value={form.notes}
                onChange={(v) => setForm({ ...form, notes: v })}
                full
                disabled={!editable}
              />
            </div>
          </section>
          {editable && (
            <PurchaseOrderLines
              lines={form.lines}
              products={products.data ?? []}
              onChange={(lines) => setForm({ ...form, lines })}
            />
          )}
          <div className="purchase-totals">
            <span>
              Subtotal <b>{subtotal.toFixed(2)}</b>
            </span>
            <span>
              Discount <b>{discount.toFixed(2)}</b>
            </span>
            <span>
              Tax <b>{tax.toFixed(2)}</b>
            </span>
            <strong>
              Grand Total {form.currencyCode} {total.toFixed(2)}
            </strong>
          </div>
          {save.error && (
            <div className="error-box">{(save.error as Error).message}</div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Cancel
          </button>
          {editable && (
            <button
              className="btn btn-primary"
              disabled={
                !permissions.includes(
                  initial ? "PURCHASE_ORDER_UPDATE" : "PURCHASE_ORDER_CREATE",
                ) ||
                save.isPending ||
                !form.lines.length
              }
            >
              Save Draft
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
