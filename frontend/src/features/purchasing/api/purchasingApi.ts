import { apiClient } from "../../../services/apiClient";

export type PurchaseOrderLine = {
  purchaseOrderLineId: number | string;
  productId: number | string;
  productUnitId: number | string | null;
  unitId: number | string;
  orderedQty: number | string;
  receivedQty: number | string;
  notes?: string | null;
  unitCost: number | string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  sourceSupplierPriceId?: number | string | null;
  costOverrideReason?: string | null;
  product?: { productName?: string; sku?: string };
  productUnit?: { unit?: { name?: string; code?: string } } | null;
};

export type PurchaseOrder = {
  purchaseOrderId: number | string;
  poNumber: string;
  supplierId: number | string;
  locationId: number | string;
  currencyCode: string;
  status: string;
  lines?: PurchaseOrderLine[];
  orderDate: string;
  expectedDate?: string | null;
  notes?: string | null;
  total?: number | string;
  supplier?: { supplierCode?: string; supplierName?: string };
  location?: { code?: string; name?: string };
};

export type PurchaseOrderPage = { items: PurchaseOrder[]; page: number; limit: number; total: number; totalPages: number };

export type GoodsReceiptLine = {
  goodsReceiptLineId?: number | string;
  purchaseOrderLineId?: number | string | null;
  productId: number | string;
  productUnitId: number | string;
  unitId: number | string;
  receivedQty: number | string;
  unitCost: number | string;
  discountAmount?: number | string;
  taxAmount?: number | string;
  sourceSupplierPriceId?: number | string | null;
  costOverrideReason?: string | null;
  batchNumber?: string | null;
  manufactureDate?: string | null;
  expiryDate?: string | null;
  product?: { productName?: string; sku?: string };
  productUnit?: { unit?: { name?: string; code?: string } };
};

export type GoodsReceipt = {
  goodsReceiptId: number | string;
  grnNumber?: string | null;
  receiptType: "DIRECT" | "PO_BASED";
  purchaseOrderId?: number | string | null;
  supplierId: number | string;
  locationId: number | string;
  receiptDate: string;
  supplierInvoiceNumber?: string | null;
  supplierDeliveryNoteNumber?: string | null;
  currencyCode: string;
  notes?: string | null;
  status: string;
  total?: number | string;
  lines?: GoodsReceiptLine[];
  supplier?: { supplierCode?: string; supplierName?: string };
  location?: { code?: string; name?: string };
  purchaseOrder?: { poNumber?: string } | null;
};

export type GoodsReceiptPayload = Record<string, unknown>;
export type GoodsReceiptPage = {
  items: GoodsReceipt[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export const purchasingApi = {
  pageOrders: (params: { page: number; limit: number; search: string; status: string }) =>
    apiClient.get<PurchaseOrderPage>(`/purchasing/purchase-orders?${new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)]))}`),
  listOrders: () => apiClient.get<PurchaseOrder[]>("/purchasing/purchase-orders"),
  getOrder: (id: number) =>
    apiClient.get<PurchaseOrder>(`/purchasing/purchase-orders/${id}`),
  createOrder: (data: Record<string, unknown>) =>
    apiClient.post<PurchaseOrder>("/purchasing/purchase-orders", data),
  updateOrder: (id: number, data: Record<string, unknown>) =>
    apiClient.put<PurchaseOrder>(`/purchasing/purchase-orders/${id}`, data),
  approveOrder: (id: number) =>
    apiClient.patch<PurchaseOrder>(`/purchasing/purchase-orders/${id}/approve`),
  cancelOrder: (id: number) =>
    apiClient.patch<PurchaseOrder>(`/purchasing/purchase-orders/${id}/cancel`),
  listReceipts: () =>
    apiClient.get<GoodsReceipt[]>("/purchasing/goods-receipts"),
  pageReceipts: (params: {
    page: number;
    limit: number;
    search: string;
    status: string;
    receiptType: string;
  }) => {
    const query = new URLSearchParams(
      Object.entries(params)
        .filter(([, value]) => value !== "")
        .map(([key, value]) => [key, String(value)]),
    ).toString();
    return apiClient.get<GoodsReceiptPage>(
      `/purchasing/goods-receipts?${query}`,
    );
  },
  getReceipt: (id: number) =>
    apiClient.get<GoodsReceipt>(`/purchasing/goods-receipts/${id}`),
  createReceipt: (data: GoodsReceiptPayload) =>
    apiClient.post<GoodsReceipt>("/purchasing/goods-receipts", data),
  updateReceipt: (id: number, data: GoodsReceiptPayload) =>
    apiClient.put<GoodsReceipt>(`/purchasing/goods-receipts/${id}`, data),
  postReceipt: (id: number) =>
    apiClient.patch<GoodsReceipt>(`/purchasing/goods-receipts/${id}/post`),
  cancelReceipt: (id: number) =>
    apiClient.patch<GoodsReceipt>(`/purchasing/goods-receipts/${id}/cancel`),
};
