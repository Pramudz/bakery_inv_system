import { apiClient } from '../../../services/apiClient';
export type ProductLocation=Record<string,any>;
export const productLocationsApi={
  list:()=>apiClient.get<ProductLocation[]>('/product-locations'),
  create:(data:Record<string,unknown>)=>apiClient.post<ProductLocation>('/product-locations',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ProductLocation>(`/product-locations/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ProductLocation>(`/product-locations/${id}/deactivate`)
};
