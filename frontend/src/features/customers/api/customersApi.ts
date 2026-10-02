import { apiClient } from '../../../services/apiClient';

export interface Customer {
  customerId: number; tenantId?: number; customerCode: string; customerName: string; isActive: boolean;
  contactName?: string | null; phone?: string | null; mobile?: string | null; email?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  districtOrState?: string | null;
  createdAt?: string; updatedAt?: string | null;
}
export interface CustomerPage { items: Customer[]; page: number; limit: number; total: number; totalPages: number; }
export type CustomerInput = Omit<Customer, 'customerId' | 'tenantId' | 'customerCode' | 'createdAt' | 'updatedAt'> & { customerCode: string };
export type CustomerUpdateInput = Partial<Omit<CustomerInput, 'customerCode'>>;
export const customersApi = {
  list: () => apiClient.get<Customer[]>('/customers'),
  page: (params: { page: number; limit: number; search: string; status: string }) =>
    apiClient.get<CustomerPage>(`/customers?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}&status=${params.status}`),
  get: (id: number) => apiClient.get<Customer>(`/customers/${id}`),
  create: (data: CustomerInput) => apiClient.post<Customer>('/customers', data),
  update: (id: number, data: CustomerUpdateInput) => apiClient.put<Customer>(`/customers/${id}`, data),
  deactivate: (id: number) => apiClient.patch<Customer>(`/customers/${id}/deactivate`),
};
