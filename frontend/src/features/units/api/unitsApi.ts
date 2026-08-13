import { apiClient } from '../../../services/apiClient';
export const unitsApi={
 list:()=>apiClient.get<any[]>('/units'),
 create:(data:any)=>apiClient.post<any>('/units',data),
 update:(id:number,data:any)=>apiClient.put<any>(`/units/${id}`,data),
 deactivate:(id:number)=>apiClient.patch<any>(`/units/${id}/deactivate`)
};
