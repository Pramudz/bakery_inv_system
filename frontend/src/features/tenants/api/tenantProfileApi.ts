import { apiClient } from '../../../services/apiClient';

import type { Tenant } from './tenantsApi';
export type TenantProfile = Tenant;
export type TenantProfileInput = Pick<Tenant, 'name' | 'legalName' | 'registrationNumber' | 'taxRegistrationNumber' | 'email' | 'phone' | 'website' | 'addressLine1' | 'addressLine2' | 'city' | 'stateProvince' | 'postalCode' | 'countryCode'>;

export const tenantProfileApi = {
  get: () => apiClient.get<TenantProfile>('/my-tenant'),
  update: (data: TenantProfileInput) => apiClient.patch<TenantProfile>('/my-tenant', data),
  uploadLogo: (file: File) => { const body = new FormData(); body.append('logo', file); return apiClient.postForm<TenantProfile>('/my-tenant/logo', body); },
  removeLogo: () => apiClient.delete<TenantProfile>('/my-tenant/logo'),
};
