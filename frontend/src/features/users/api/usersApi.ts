import { apiClient } from '../../../services/apiClient';
export type User = Record<string, any>;
export const usersApi = {
  list:()=>apiClient.get<User[]>('/users'),
  create:(data:Record<string,unknown>)=>apiClient.post<User>('/users',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<User>(`/users/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<User>(`/users/${id}/deactivate`)
};
