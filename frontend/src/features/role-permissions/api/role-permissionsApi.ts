import { apiClient } from '../../../services/apiClient';
export type RolePermission=Record<string,any>;
export const rolePermissionsApi={
  list:()=>apiClient.get<RolePermission[]>('/role-permissions'),
  create:(data:Record<string,unknown>)=>apiClient.post<RolePermission>('/role-permissions',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<RolePermission>(`/role-permissions/${id}`,data),
  remove:(id:number)=>apiClient.delete<{removed:boolean}>(`/role-permissions/${id}`)
};
