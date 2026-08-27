import { apiClient } from '../../../services/apiClient';

export type InvoiceCatalogProduct = {
  productId: number;
  code: string;
  name: string;
  category: string;
  retailPrice: number | string;
  wholesalePrice: number | string;
  stock: number | string;
};

export type CreateInvoiceInput = {
  locationId: number;
  customerId?: number;
  saleType: 'RETAIL' | 'WHOLESALE';
  details: { productId: number; quantity: number; unitPrice: number; discountPercentage: number; discountAmount: number }[];
  payments: { paymentMethodId: number; amount: number; referenceNumber?: string }[];
};

export const invoicesApi = {
  list: () => apiClient.get<any[]>('/invoices'),
  get: (id: number) => apiClient.get<any>(`/invoices/${id}`),
  refundable: (id: number) => apiClient.get<any>(`/invoices/${id}/refundable`),
  catalog: (locationId: number) => apiClient.get<InvoiceCatalogProduct[]>(`/invoices/catalog?locationId=${locationId}`),
  create: (data: CreateInvoiceInput) => apiClient.post<Record<string, any>>('/invoices', data),
  reversePayment: (invoiceId: number, paymentId: number, data: Record<string, unknown>) => apiClient.post<any>(`/invoices/${invoiceId}/payments/${paymentId}/reverse`, data),
};
