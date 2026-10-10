import { apiClient } from '../../../services/apiClient';

export type CreateInvoiceRefundInput = {
  refundKey: string;
  invoiceId: number;
  reason: string;
  details: { invoiceDetailId: number; quantity: number; returnToStock: boolean }[];
  payments: { paymentMethodId: number; amount: number; paymentChannelId?: number; referenceNumber?: string }[];
};

export const invoiceRefundsApi = {
  lookupSale: (reference: { businessDate: string; locationCode: string; registerCode: string; billNo: number }) => apiClient.get<any>(`/invoice-refunds/sale-lookup?${new URLSearchParams({ businessDate: reference.businessDate, locationCode: reference.locationCode, registerCode: reference.registerCode, billNo: String(reference.billNo) })}`),
  list: () => apiClient.get<any[]>('/invoice-refunds'),
  page: (page: number, limit: number, search: string) => apiClient.get<{ items: any[]; total: number; page: number; limit: number }>(`/invoice-refunds/page?${new URLSearchParams({ page: String(page), limit: String(limit), search })}`),
  get: (id: number) => apiClient.get<any>(`/invoice-refunds/${id}`),
  reprint: (id: number) => apiClient.post<{ copy: boolean }>(`/invoice-refunds/${id}/reprint`, {}),
  create: (data: CreateInvoiceRefundInput) => apiClient.post<any>('/invoice-refunds', data),
  outcome: (invoiceId: number, key: string) => apiClient.get<any>(`/invoice-refunds/by-key/${encodeURIComponent(key)}?invoiceId=${invoiceId}`),
};
