import { apiClient } from '../../../services/apiClient';

export type CreateInvoiceRefundInput = {
  invoiceId: number;
  reason: string;
  details: { invoiceDetailId: number; quantity: number; returnToStock: boolean }[];
  payments: { paymentMethodId: number; amount: number; referenceNumber?: string }[];
};

export const invoiceRefundsApi = {
  list: () => apiClient.get<any[]>('/invoice-refunds'),
  get: (id: number) => apiClient.get<any>(`/invoice-refunds/${id}`),
  create: (data: CreateInvoiceRefundInput) => apiClient.post<any>('/invoice-refunds', data),
};
