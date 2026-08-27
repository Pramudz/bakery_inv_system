import { apiClient } from '../../../services/apiClient';

export type PaymentMethod = {
  paymentMethodId: number;
  tenantId: number;
  paymentMethodName: string;
  isActive: boolean;
};

export type PaymentMethodInput = Pick<PaymentMethod, 'paymentMethodName'>;

export const paymentMethodsApi = {
  list: () => apiClient.get<PaymentMethod[]>('/payment-methods'),
  create: (data: PaymentMethodInput) => apiClient.post<PaymentMethod>('/payment-methods', data),
  update: (id: number, data: PaymentMethodInput) => apiClient.put<PaymentMethod>(`/payment-methods/${id}`, data),
  setActive: (id: number, active: boolean) =>
    apiClient.patch<PaymentMethod>(`/payment-methods/${id}/${active ? 'activate' : 'deactivate'}`),
};
