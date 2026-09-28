import { apiClient } from '../../../services/apiClient';

export type PendingInvoice = {
  invoiceId: number;
  invoiceNumber: string;
  invoiceDate: string;
  grandTotal: string;
  paidAmount: string;
  balanceAmount: string;
  paymentStatus: string;
  customer: { customerName: string; phone: string | null; mobile: string | null } | null;
  location: { name: string };
};

export type PaymentReceipt = {
  invoicePaymentId: number;
  invoiceId: number;
  paidAt: string;
  amount: string;
  balanceBefore: string;
  balanceAfter: string;
  referenceNumber: string | null;
  isReversed: boolean;
  invoice: PendingInvoice;
  paymentMethod: { paymentMethodName: string };
};

export type ReceivePaymentInput = {
  amount: number;
  paymentMethodId: number;
  referenceNumber?: string;
  collectionKey: string;
};

export const pendingPaymentsApi = {
  list: () => apiClient.get<PendingInvoice[]>('/invoices/pending-payments'),
  history: () => apiClient.get<PaymentReceipt[]>('/invoices/payment-receipts'),
  receive: (id: number, data: ReceivePaymentInput) =>
    apiClient.post<Omit<PaymentReceipt, 'invoice' | 'paymentMethod'>>(`/invoices/${id}/payments`, data),
};
