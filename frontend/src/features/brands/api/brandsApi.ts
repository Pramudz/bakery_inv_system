import { apiClient } from '../../../services/apiClient';
export type Brand=Record<string,any>;
export const brandsApi={
  list:()=>apiClient.get<Brand[]>('/brands'),
  create:(data:Record<string,unknown>)=>apiClient.post<Brand>('/brands',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Brand>(`/brands/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Brand>(`/brands/${id}/deactivate`)
};
