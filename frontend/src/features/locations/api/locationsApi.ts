import { apiClient } from '../../../services/apiClient';
export const LOCATION_TYPES = ['HEAD_OFFICE', 'WAREHOUSE', 'STORE', 'DISTRIBUTION_CENTER', 'OFFICE', 'OTHER'] as const;
export type LocationType = typeof LOCATION_TYPES[number];
export interface Location {
  locationId: number; tenantId?: number; code: string; name: string; locationType: LocationType; isActive: boolean;
  tenant?: { name: string };
  contactPerson?: string | null; email?: string | null; phone?: string | null;
  addressLine1?: string | null; addressLine2?: string | null; city?: string | null;
  stateProvince?: string | null; postalCode?: string | null; countryCode?: string | null;
  createdAt?: string; updatedAt?: string | null;
}
export interface LocationPage {
  items: Location[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export type LocationInput = Omit<Location, 'locationId' | 'tenantId' | 'tenant' | 'createdAt' | 'updatedAt'>;
export const locationsApi = {
  list: () => apiClient.get<Location[]>('/locations'),
  page: (params: { page: number; limit: number; search: string; status: string }) =>
    apiClient.get<LocationPage>(`/locations?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}&status=${params.status}`),
  get: (id: number) => apiClient.get<Location>(`/locations/${id}`),
  create: (data: LocationInput) => apiClient.post<Location>('/locations', data),
  update: (id: number, data: Partial<LocationInput>) => apiClient.put<Location>(`/locations/${id}`, data),
  deactivate: (id: number) => apiClient.patch<Location>(`/locations/${id}/deactivate`),
  activate: (id: number) => apiClient.patch<Location>(`/locations/${id}/activate`),
};
