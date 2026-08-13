import { apiClient } from '../../../services/apiClient';
export type RolePermission=Record<string,any>;
export const rolePermissionsApi={
  list:()=>apiClient.get<RolePermission[]>('/role-permissions'),
  create:(data:Record<string,unknown>)=>apiClient.post<RolePermission>('/role-permissions',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<RolePermission>(`/role-permissions/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<RolePermission>(`/role-permissions/${id}/deactivate`)
};
