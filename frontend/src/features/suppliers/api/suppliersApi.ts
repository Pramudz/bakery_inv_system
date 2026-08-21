import { apiClient } from '../../../services/apiClient';

export interface Supplier {
  supplierId: number; tenantId?: number; supplierCode: string; supplierName: string; isActive: boolean;
  contactName?: string | null; phone?: string | null; mobile?: string | null; email?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  districtOrState?: string | null; postalCode?: string | null; countryCode?: string | null;
  createdAt?: string; updatedAt?: string | null;
}
export interface SupplierPage { items: Supplier[]; page: number; limit: number; total: number; totalPages: number; }
export type SupplierInput = Omit<Supplier, 'supplierId' | 'tenantId' | 'supplierCode' | 'createdAt' | 'updatedAt'> & { supplierCode?: string };
export type SupplierUpdateInput = Partial<Omit<SupplierInput, 'supplierCode'>>;
export const suppliersApi = {
  list: () => apiClient.get<Supplier[]>('/suppliers'),
  page: (params: { page: number; limit: number; search: string; status: string }) =>
    apiClient.get<SupplierPage>(`/suppliers?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}&status=${params.status}`),
  get: (id: number) => apiClient.get<Supplier>(`/suppliers/${id}`),
  create: (data: SupplierInput) => apiClient.post<Supplier>('/suppliers', data),
  update: (id: number, data: SupplierUpdateInput) => apiClient.put<Supplier>(`/suppliers/${id}`, data),
  deactivate: (id: number) => apiClient.patch<Supplier>(`/suppliers/${id}/deactivate`),
};
