import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { purchasingApi } from "../api/purchasingApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { locationsApi } from "../../locations/api/locationsApi";
import { useAuth } from "../../auth/AuthContext";
import { GoodsReceiptForm } from "../components/GoodsReceiptForm";
export function GoodsReceiptsPage() {
  const { permissions } = useAuth(),
    client = useQueryClient(),
    receipts = useQuery({
      queryKey: ["goods-receipts"],
      queryFn: purchasingApi.listReceipts,
    }),
    suppliers = useQuery({
      queryKey: ["suppliers"],
      queryFn: suppliersApi.list,
    }),
    locations = useQuery({
      queryKey: ["locations"],
      queryFn: locationsApi.list,
    });
  const [form, setForm] = useState<any>(null);
  const post = useMutation({
    mutationFn: purchasingApi.postReceipt,
    onSuccess: () => client.invalidateQueries({ queryKey: ["goods-receipts"] }),
  });
  const cancel = useMutation({
    mutationFn: purchasingApi.cancelReceipt,
    onSuccess: () => client.invalidateQueries({ queryKey: ["goods-receipts"] }),
  });
  const supplier = (id: any) => {
    const x = (suppliers.data ?? []).find(
      (v: any) => String(v.supplierId) === String(id),
    );
    return x ? `${x.supplierCode} — ${x.supplierName}` : id;
  };
  const location = (id: any) => {
    const x = (locations.data ?? []).find(
      (v: any) => String(v.locationId) === String(id),
    );
    return x ? `${x.code} — ${x.name}` : id;
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">PURCHASING</div>
          <h1>Goods Receipts</h1>
          <p>Receive PO-based or direct supplier deliveries.</p>
        </div>
        {permissions.includes("GRN_CREATE") && (
          <button className="btn btn-primary" onClick={() => setForm({})}>
            Create Goods Receipt
          </button>
        )}
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>GRN Number</th>
              <th>Type</th>
              <th>Supplier</th>
              <th>Location</th>
              <th>PO</th>
              <th>Invoice</th>
              <th>Receipt Date</th>
              <th>Status</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {receipts.isLoading ? (
              <tr>
                <td colSpan={10} className="empty">
                  Loading...
                </td>
              </tr>
            ) : (
              (receipts.data ?? []).map((x: any) => (
                <tr key={x.goodsReceiptId}>
                  <td>{x.grnNumber}</td>
                  <td>{x.receiptType}</td>
                  <td>{supplier(x.supplierId)}</td>
                  <td>{location(x.locationId)}</td>
                  <td>{x.purchaseOrderId || "—"}</td>
                  <td>{x.supplierInvoiceNumber || "—"}</td>
                  <td>{x.receiptDate}</td>
                  <td>{x.status}</td>
                  <td>
                    {x.currencyCode || "LKR"} {Number(x.total || 0).toFixed(2)}
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-ghost"
                      onClick={async () =>
                        setForm(
                          await purchasingApi.getReceipt(x.goodsReceiptId),
                        )
                      }
                    >
                      View
                    </button>
                    {x.status === "DRAFT" &&
                      permissions.includes("GRN_UPDATE") && (
                        <button
                          className="btn btn-ghost"
                          onClick={async () =>
                            setForm(
                              await purchasingApi.getReceipt(x.goodsReceiptId),
                            )
                          }
                        >
                          Edit
                        </button>
                      )}
                    {x.status === "DRAFT" &&
                      permissions.includes("GRN_POST") && (
                        <button
                          className="btn btn-primary"
                          disabled={post.isPending}
                          onClick={() =>
                            window.confirm(
                              "Posting this GRN will update inventory quantity, weighted average cost and inventory history. Continue?",
                            ) && post.mutate(x.goodsReceiptId)
                          }
                        >
                          Post
                        </button>
                      )}
                    {x.status === "DRAFT" &&
                      permissions.includes("GRN_CANCEL") && (
                        <button
                          className="btn btn-danger-soft"
                          onClick={() =>
                            window.confirm("Cancel this draft GRN?") &&
                            cancel.mutate(x.goodsReceiptId)
                          }
                        >
                          Cancel
                        </button>
                      )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {post.error && (
          <div className="error-box">{(post.error as Error).message}</div>
        )}
      </div>
      {form && (
        <GoodsReceiptForm
          close={() => setForm(null)}
          initial={Object.keys(form).length ? form : undefined}
        />
      )}
    </div>
  );
}
