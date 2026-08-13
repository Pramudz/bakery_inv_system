import { apiClient } from '../../../services/apiClient';

export type TenantProfile = {
  tenantId: string | number;
  tenantCode: string;
  tenantName: string;
  tenantIsActive: boolean;
  createdAt?: string;
  updatedAt?: string | null;
};

export const tenantProfileApi = {
  get: () => apiClient.get<TenantProfile>('/tenant/me'),
};
