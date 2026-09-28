import { apiClient } from '../../../services/apiClient';

export type InvoiceCatalogProduct = {
  productId: number;
  code: string;
  name: string;
  category: string;
  retailPrice: number | string;
  wholesalePrice: number | string;
  stock: number | string;
  discountPercentage: number | string;
  discountAmount: number | string;
  finalUnitPrice: number | string;
  pricing: InvoiceQuoteLine;
};

export type InvoiceQuoteLine = {
  productId: number;
  productUnitId: number;
  priceListId: number;
  priceListItemId: number;
  priceListItemDiscountId: number | null;
  discountType: string | null;
  discountValue: string | null;
  quantity: number;
  unitPrice: number;
  discountPerUnit: number;
  discountPercentage: number;
  grossTotal: number;
  discountAmount: number;
  netTotal: number;
  currencyCode: string;
};

export type InvoiceQuote = {
  quotedAt: string;
  locationId: number;
  saleType: 'RETAIL' | 'WHOLESALE';
  lines: InvoiceQuoteLine[];
  subtotal: number;
  discountTotal: number;
  grandTotal: number;
};

export type CreateInvoiceInput = {
  checkoutKey: string;
  locationId: number;
  customerId?: number;
  saleType: 'RETAIL' | 'WHOLESALE';
  details: { productId: number; quantity: number; unitPrice?: number; discountPercentage?: number; discountAmount?: number; quotedPriceListItemId?: number; quotedPriceListItemDiscountId?: number; quotedUnitPrice?: number; quotedDiscountAmount?: number }[];
  payments: { paymentMethodId: number; amount: number; referenceNumber?: string }[];
  acceptPriceChanges?: boolean;
};

export const invoicesApi = {
  list: () => apiClient.get<any[]>('/invoices'),
  get: (id: number) => apiClient.get<any>(`/invoices/${id}`),
  refundable: (id: number) => apiClient.get<any>(`/invoices/${id}/refundable`),
  billingLocations: () => apiClient.get<{ locationId: number; code: string; name: string; isActive: boolean }[]>('/invoices/locations'),
  catalog: (locationId: number, saleType: 'RETAIL' | 'WHOLESALE') => apiClient.get<InvoiceCatalogProduct[]>(`/invoices/catalog?locationId=${locationId}&saleType=${saleType}`),
  quote: (data: { locationId: number; saleType: 'RETAIL' | 'WHOLESALE'; details: { productId: number; quantity: number }[] }) => apiClient.post<InvoiceQuote>('/invoices/quote', data),
  create: (data: CreateInvoiceInput) => apiClient.post<Record<string, any>>('/invoices', data),
  reversePayment: (invoiceId: number, paymentId: number, data: Record<string, unknown>) => apiClient.post<any>(`/invoices/${invoiceId}/payments/${paymentId}/reverse`, data),
};
