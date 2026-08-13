import { apiClient } from '../../../services/apiClient';
export type Location = Record<string, any>;
export const locationsApi = {
  list:()=>apiClient.get<Location[]>('/locations'),
  create:(data:Record<string,unknown>)=>apiClient.post<Location>('/locations',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Location>(`/locations/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Location>(`/locations/${id}/deactivate`)
};
