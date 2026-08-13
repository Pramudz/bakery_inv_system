import { apiClient } from '../../../services/apiClient';
export type Permission=Record<string,any>;
export const permissionsApi={
  list:()=>apiClient.get<Permission[]>('/permissions'),
  create:(data:Record<string,unknown>)=>apiClient.post<Permission>('/permissions',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Permission>(`/permissions/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Permission>(`/permissions/${id}/deactivate`)
};
