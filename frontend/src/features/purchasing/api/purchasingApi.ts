import { apiClient } from "../../../services/apiClient";
export const purchasingApi = {
  listOrders: () => apiClient.get<any[]>("/purchasing/purchase-orders"),
  getOrder: (id: number) =>
    apiClient.get<any>(`/purchasing/purchase-orders/${id}`),
  createOrder: (data: any) =>
    apiClient.post("/purchasing/purchase-orders", data),
  updateOrder: (id: number, data: any) =>
    apiClient.put(`/purchasing/purchase-orders/${id}`, data),
  approveOrder: (id: number) =>
    apiClient.patch(`/purchasing/purchase-orders/${id}/approve`),
  cancelOrder: (id: number) =>
    apiClient.patch(`/purchasing/purchase-orders/${id}/cancel`),
  listReceipts: () => apiClient.get<any[]>("/purchasing/goods-receipts"),
  getReceipt: (id: number) =>
    apiClient.get<any>(`/purchasing/goods-receipts/${id}`),
  createReceipt: (data: any) =>
    apiClient.post("/purchasing/goods-receipts", data),
  updateReceipt: (id: number, data: any) =>
    apiClient.put(`/purchasing/goods-receipts/${id}`, data),
  postReceipt: (id: number) =>
    apiClient.patch(`/purchasing/goods-receipts/${id}/post`),
  cancelReceipt: (id: number) =>
    apiClient.patch(`/purchasing/goods-receipts/${id}/cancel`),
};
