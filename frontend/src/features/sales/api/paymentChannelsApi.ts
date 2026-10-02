import { apiClient } from '../../../services/apiClient';

export type PaymentChannel = {
  paymentChannelId: number;
  tenantId: number;
  code: string;
  name: string;
  isActive: boolean;
};

export type PaymentChannelInput = Pick<PaymentChannel, 'code' | 'name'>;

export const paymentChannelsApi = {
  list: (activeOnly = false) => apiClient.get<PaymentChannel[]>(`/payment-channels?activeOnly=${activeOnly}`),
  create: (data: PaymentChannelInput) => apiClient.post<PaymentChannel>('/payment-channels', data),
  update: (id: number, data: PaymentChannelInput) => apiClient.put<PaymentChannel>(`/payment-channels/${id}`, data),
  setActive: (id: number, active: boolean) => apiClient.patch<PaymentChannel>(`/payment-channels/${id}/${active ? 'activate' : 'deactivate'}`),
};
