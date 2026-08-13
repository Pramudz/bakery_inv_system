import { apiClient } from '../../../services/apiClient';
export type Role=Record<string,any>;
export const rolesApi={
  list:()=>apiClient.get<Role[]>('/roles'),
  create:(data:Record<string,unknown>)=>apiClient.post<Role>('/roles',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Role>(`/roles/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Role>(`/roles/${id}/deactivate`)
};
