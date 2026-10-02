import { apiClient } from '../../../services/apiClient';

export const invoiceAdjustmentsApi = {
  list: () => apiClient.get<any[]>('/invoice-adjustments'),
  create: (data: Record<string, unknown>) => apiClient.post<any>('/invoice-adjustments', data),
};
