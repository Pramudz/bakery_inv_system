import { apiClient } from '../../../services/apiClient';
export type UserSession=Record<string,any>;
export const userSessionsApi={
  list:()=>apiClient.get<UserSession[]>('/user-sessions'),
  create:(data:Record<string,unknown>)=>apiClient.post<UserSession>('/user-sessions',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<UserSession>(`/user-sessions/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<UserSession>(`/user-sessions/${id}/deactivate`)
};
