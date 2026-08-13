import { apiClient } from '../../../services/apiClient';
export type UserRole=Record<string,any>;
export const userRolesApi={
  list:()=>apiClient.get<UserRole[]>('/user-roles'),
  create:(data:Record<string,unknown>)=>apiClient.post<UserRole>('/user-roles',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<UserRole>(`/user-roles/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<UserRole>(`/user-roles/${id}/deactivate`)
};
