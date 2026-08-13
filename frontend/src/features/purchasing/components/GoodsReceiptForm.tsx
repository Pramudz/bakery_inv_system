import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Modal } from "../../../components/ui/Modal";
import { Field } from "../../../components/ui/Field";
import { useAuth } from "../../auth/AuthContext";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { locationsApi } from "../../locations/api/locationsApi";
import { productsApi } from "../../products/api/productsApi";
import { purchasingApi } from "../api/purchasingApi";
import { GoodsReceiptLines, grnTotal } from "./GoodsReceiptLines";
const today = new Date().toISOString().slice(0, 10);
const blank = {
  productId: "",
  unitId: "",
  receivedQty: "1",
  unitCost: "0",
  discountAmount: "0",
  taxAmount: "0",
  batchNumber: "",
  manufactureDate: "",
  expiryDate: "",
};
export function GoodsReceiptForm({
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
  const orders = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: purchasingApi.listOrders,
  });
  const [form, setForm] = useState<any>(
    initial
      ? {
          ...initial,
          lines: initial.lines?.length ? initial.lines : [{ ...blank }],
        }
      : {
          grnNumber: "",
          receiptType: "DIRECT",
          purchaseOrderId: "",
          supplierId: "",
          locationId: "",
          receiptDate: today,
          supplierInvoiceNumber: "",
          supplierInvoiceDate: "",
          supplierDeliveryNoteNumber: "",
          currencyCode: "LKR",
          notes: "",
          lines: [{ ...blank }],
        },
  );
  const save = useMutation({
    mutationFn: (data: any) =>
      initial
        ? purchasingApi.updateReceipt(initial.goodsReceiptId, data)
        : purchasingApi.createReceipt(data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["goods-receipts"] });
      close();
    },
  });
  const poBased = form.receiptType === "PO_BASED";
  const choosePo = async (id: string) => {
    const po: any = await purchasingApi.getOrder(Number(id));
    setForm({
      ...form,
      purchaseOrderId: id,
      supplierId: String(po.supplierId),
      locationId: String(po.locationId),
      currencyCode: po.currencyCode,
      lines: (po.lines ?? [])
        .filter(
          (line: any) => Number(line.receivedQty) < Number(line.orderedQty),
        )
        .map((line: any) => ({
          ...blank,
          purchaseOrderLineId: line.purchaseOrderLineId,
          productId: String(line.productId),
          productName: line.product?.productName,
          unitId: String(line.unitId),
          orderedQty: String(line.orderedQty),
          previouslyReceivedQty: String(line.receivedQty),
          receivedQty: "0",
          unitCost: String(line.unitCost),
        })),
    });
  };
  const total = form.lines.reduce(
    (sum: number, line: any) => sum + grnTotal(line),
    0,
  );
  const editable = !initial || initial.status === "DRAFT";
  return (
    <Modal
      open
      title={
        initial ? `Edit GRN — ${initial.grnNumber}` : "Create Goods Receipt"
      }
      subtitle="Save a draft first. Posting is a separate, inventory-changing action."
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
            <div className="receipt-type">
              <button
                type="button"
                className={form.receiptType === "DIRECT" ? "active" : ""}
                disabled={!!initial}
                onClick={() =>
                  setForm({
                    ...form,
                    receiptType: "DIRECT",
                    purchaseOrderId: "",
                    lines: [{ ...blank }],
                  })
                }
              >
                Direct GRN
              </button>
              <button
                type="button"
                className={poBased ? "active" : ""}
                disabled={!!initial}
                onClick={() =>
                  setForm({ ...form, receiptType: "PO_BASED", lines: [] })
                }
              >
                PO Based
              </button>
            </div>
            <div className="form-grid">
              <Field
                label="GRN Number"
                value={form.grnNumber}
                onChange={(v) => setForm({ ...form, grnNumber: v })}
                required
                disabled={!editable}
              />
              {poBased ? (
                <Field
                  label="Purchase Order"
                  value={form.purchaseOrderId}
                  onChange={choosePo}
                  required
                  disabled={!editable}
                  options={(orders.data ?? [])
                    .filter((x: any) =>
                      ["APPROVED", "SENT", "PART_RECEIVED"].includes(x.status),
                    )
                    .map((x: any) => ({
                      value: x.purchaseOrderId,
                      label: x.poNumber,
                    }))}
                />
              ) : (
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
              )}
              <Field
                label="Receiving Location"
                value={form.locationId}
                onChange={(v) => setForm({ ...form, locationId: v })}
                required
                disabled={!editable || poBased}
                options={(locations.data ?? []).map((x: any) => ({
                  value: x.locationId,
                  label: `${x.code} — ${x.name}`,
                }))}
              />
              <Field
                label="Receipt Date"
                type="date"
                value={form.receiptDate}
                onChange={(v) => setForm({ ...form, receiptDate: v })}
                required
                disabled={!editable}
              />
              <Field
                label="Supplier Invoice Number"
                value={form.supplierInvoiceNumber}
                onChange={(v) => setForm({ ...form, supplierInvoiceNumber: v })}
                disabled={!editable}
              />
              <Field
                label="Invoice Date"
                type="date"
                value={form.supplierInvoiceDate}
                onChange={(v) => setForm({ ...form, supplierInvoiceDate: v })}
                disabled={!editable}
              />
              <Field
                label="Delivery Note Number"
                value={form.supplierDeliveryNoteNumber}
                onChange={(v) =>
                  setForm({ ...form, supplierDeliveryNoteNumber: v })
                }
                disabled={!editable}
              />
              <Field
                label="Currency"
                value={form.currencyCode}
                onChange={(v) => setForm({ ...form, currencyCode: v })}
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
            <GoodsReceiptLines
              lines={form.lines}
              products={products.data ?? []}
              poBased={poBased}
              onChange={(lines) => setForm({ ...form, lines })}
            />
          )}
          <div className="purchase-totals">
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
                !permissions.includes(initial ? "GRN_UPDATE" : "GRN_CREATE") ||
                save.isPending
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
