import { env } from '../../../config/env';
import { apiClient } from '../../../services/apiClient';

export interface TenantLocation {
  locationId: number; code: string; name: string; locationType: string; isActive: boolean;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  stateProvince?: string | null; postalCode?: string | null; countryCode?: string | null;
}
export interface Tenant {
  tenantId: number; code: string; name: string; isActive: boolean;
  legalName?: string | null; registrationNumber?: string | null; taxRegistrationNumber?: string | null;
  email?: string | null; phone?: string | null; website?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  stateProvince?: string | null; postalCode?: string | null; countryCode?: string | null;
  logoUrl?: string | null; locations?: TenantLocation[]; createdAt?: string; updatedAt?: string | null;
}
export type TenantInput = Omit<Tenant, 'tenantId' | 'locations' | 'logoUrl' | 'createdAt' | 'updatedAt'>;
export type TenantCreateResult = { message: string; tenant: Tenant; bootstrap: Record<string, unknown> };
export const mediaUrl = (path?: string | null) => path ? (path.startsWith('http') ? path : `${env.apiUrl.replace(/\/api\/?$/, '')}${path}`) : '';
export const tenantsApi = {
  list: () => apiClient.get<Tenant[]>('/tenants'),
  get: (id: number) => apiClient.get<Tenant>(`/tenants/${id}`),
  create: (data: TenantInput) => apiClient.post<TenantCreateResult>('/tenants', data),
  update: (id: number, data: Partial<TenantInput>) => apiClient.put<Tenant>(`/tenants/${id}`, data),
  uploadLogo: (id: number, file: File) => { const body = new FormData(); body.append('logo', file); return apiClient.postForm<Tenant>(`/tenants/${id}/logo`, body); },
  removeLogo: (id: number) => apiClient.delete<Tenant>(`/tenants/${id}/logo`),
  deactivate: (id: number) => apiClient.patch<Tenant>(`/tenants/${id}/deactivate`),
  activate: (id: number) => apiClient.patch<Tenant>(`/tenants/${id}/activate`),
  listModules: (id: number) => apiClient.get<Record<string, any>[]>(`/tenants/${id}/modules`),
  setModuleEnabled: (tenantId: number, moduleId: number, isEnabled: boolean) => apiClient.put(`/tenants/${tenantId}/modules/${moduleId}`, { isEnabled }),
};
