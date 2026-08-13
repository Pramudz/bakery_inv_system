import { apiClient } from '../../../services/apiClient';
export type Product = Record<string, any>;
export const productsApi = {
  list:()=>apiClient.get<Product[]>('/products'),
  create:(data:Record<string,unknown>)=>apiClient.post<Product>('/products',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Product>(`/products/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Product>(`/products/${id}/deactivate`)
};
