import { apiClient } from '../../../services/apiClient';
export const productUnitsApi={
 list:()=>apiClient.get<any[]>('/product-units'),
 create:(data:any)=>apiClient.post<any>('/product-units',data),
 update:(id:number,data:any)=>apiClient.put<any>(`/product-units/${id}`,data),
 deactivate:(id:number)=>apiClient.patch<any>(`/product-units/${id}/deactivate`)
};
