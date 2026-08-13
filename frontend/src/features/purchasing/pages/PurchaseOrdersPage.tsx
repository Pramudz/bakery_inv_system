import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useAuth } from "../../auth/AuthContext";
import { locationsApi } from "../../locations/api/locationsApi";
import { suppliersApi } from "../../suppliers/api/suppliersApi";
import { purchasingApi } from "../api/purchasingApi";
import { PurchaseOrderForm } from "../components/PurchaseOrderForm";

interface PurchaseOrderSummary {
  purchaseOrderId: number;
  poNumber: string;
  supplierId: number;
  locationId: number;
  orderDate: string;
  expectedDate?: string | null;
  status: string;
  currencyCode?: string;
  total?: number;
}

export function PurchaseOrdersPage() {
  const { permissions } = useAuth();
  const client = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);

  const orders = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: purchasingApi.listOrders,
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: suppliersApi.list,
  });
  const locations = useQuery({
    queryKey: ["locations"],
    queryFn: locationsApi.list,
  });
  const approve = useMutation({
    mutationFn: purchasingApi.approveOrder,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });
  const cancel = useMutation({
    mutationFn: purchasingApi.cancelOrder,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ["purchase-orders"] }),
  });

  const supplierName = (supplierId: number) => {
    const supplier = (suppliers.data ?? []).find(
      (item: any) => String(item.supplierId) === String(supplierId),
    );
    return supplier
      ? `${supplier.supplierCode} — ${supplier.supplierName}`
      : supplierId;
  };
  const locationName = (locationId: number) => {
    const location = (locations.data ?? []).find(
      (item: any) => String(item.locationId) === String(locationId),
    );
    return location ? `${location.code} — ${location.name}` : locationId;
  };
  const openOrder = async (orderId: number) =>
    setSelectedOrder(await purchasingApi.getOrder(orderId));

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">PURCHASING</div>
          <h1>Purchase Orders</h1>
          <p>Create, approve and track supplier purchase orders.</p>
        </div>
        {permissions.includes("PURCHASE_ORDER_CREATE") && (
          <button
            className="btn btn-primary"
            onClick={() => setSelectedOrder({})}
          >
            Create Purchase Order
          </button>
        )}
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Supplier</th>
              <th>Location</th>
              <th>Order Date</th>
              <th>Expected Date</th>
              <th>Status</th>
              <th>Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.isLoading ? (
              <tr>
                <td colSpan={8} className="empty">
                  Loading...
                </td>
              </tr>
            ) : (
              ((orders.data as PurchaseOrderSummary[]) ?? []).map((order) => (
                <tr key={order.purchaseOrderId}>
                  <td>{order.poNumber}</td>
                  <td>{supplierName(order.supplierId)}</td>
                  <td>{locationName(order.locationId)}</td>
                  <td>{order.orderDate}</td>
                  <td>{order.expectedDate || "—"}</td>
                  <td>{order.status}</td>
                  <td>
                    {order.currencyCode || "LKR"}{" "}
                    {Number(order.total || 0).toFixed(2)}
                  </td>
                  <td className="actions">
                    <button
                      className="btn btn-ghost"
                      onClick={() => openOrder(order.purchaseOrderId)}
                    >
                      View
                    </button>
                    {order.status === "DRAFT" &&
                      permissions.includes("PURCHASE_ORDER_UPDATE") && (
                        <button
                          className="btn btn-ghost"
                          onClick={() => openOrder(order.purchaseOrderId)}
                        >
                          Edit
                        </button>
                      )}
                    {order.status === "DRAFT" &&
                      permissions.includes("PURCHASE_ORDER_APPROVE") && (
                        <button
                          className="btn btn-secondary"
                          onClick={() => approve.mutate(order.purchaseOrderId)}
                        >
                          Approve
                        </button>
                      )}
                    {["DRAFT", "APPROVED", "SENT"].includes(order.status) &&
                      permissions.includes("PURCHASE_ORDER_CANCEL") && (
                        <button
                          className="btn btn-danger-soft"
                          onClick={() =>
                            window.confirm("Cancel this purchase order?") &&
                            cancel.mutate(order.purchaseOrderId)
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
      </div>
      {selectedOrder && (
        <PurchaseOrderForm
          close={() => setSelectedOrder(null)}
          initial={
            Object.keys(selectedOrder).length ? selectedOrder : undefined
          }
        />
      )}
    </div>
  );
}
