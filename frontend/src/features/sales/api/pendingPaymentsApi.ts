import { apiClient } from '../../../services/apiClient';

export type PendingInvoice = {
  invoiceId: number;
  invoiceNumber: string;
  businessDate?: string | null;
  printedLocationCode?: string | null;
  printedRegisterCode?: string | null;
  billNo?: number | null;
  invoiceDate: string;
  grandTotal: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus: string;
  isCreditSale?: boolean;
  collectionEligible?: boolean;
  customer: { customerName: string; phone: string | null; mobile: string | null } | null;
  location: { locationId: number; name: string };
};

export type PaymentReceipt = {
  invoicePaymentId: number;
  invoiceId: number;
  collectionKey?: string | null;
  paymentMethodId?: number;
  paymentChannelId?: number | null;
  posRegisterSessionId?: number | null;
  posCashierSessionId?: number | null;
  paidAt: string;
  amount: string;
  tenderedAmount: string;
  changeAmount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceNumber: string | null;
  isReversed: boolean;
  invoice: PendingInvoice;
  paymentMethod: { paymentMethodName: string; paymentMethodType?: 'CASH' | 'CARD' | 'CHEQUE' | null };
  paymentChannel?: { paymentChannelId: number; name: string } | null;
};

export type ReceivePaymentInput = {
  amount: number;
  paymentMethodId: number;
  referenceNumber?: string;
  paymentChannelId?: number;
  collectionKey: string;
};

export const pendingPaymentsApi = {
  list: () => apiClient.get<PendingInvoice[]>('/invoices/pending-payments'),
  history: () => apiClient.get<PaymentReceipt[]>('/invoices/payment-receipts'),
  page: (page: number, limit: number, search: string, status: string) => apiClient.get<{ items: PendingInvoice[]; total: number; stats: { outstanding: number; partiallyPaid: number; unpaid: number } }>(`/invoices/pending-payments/page?${new URLSearchParams({ page: String(page), limit: String(limit), search, status })}`),
  historyPage: (page: number, limit: number, search: string) => apiClient.get<{ items: PaymentReceipt[]; total: number; stats: { received: number } }>(`/invoices/payment-receipts/page?${new URLSearchParams({ page: String(page), limit: String(limit), search })}`),
  receive: (id: number, data: ReceivePaymentInput) =>
    apiClient.post<Omit<PaymentReceipt, 'invoice' | 'paymentMethod'>>(`/invoices/${id}/payments`, data),
  outcome: (id: number, key: string) => apiClient.get<PaymentReceipt>(`/invoices/${id}/payments/by-key/${encodeURIComponent(key)}`),
};
