import { apiClient } from '../../../services/apiClient';
export type UserSession=Record<string,any>;
export const userSessionsApi={
  list:()=>apiClient.get<UserSession[]>('/user-sessions'),
  deactivate:(id:number)=>apiClient.patch<UserSession>(`/user-sessions/${id}/deactivate`)
};
