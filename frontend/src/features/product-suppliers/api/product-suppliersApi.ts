import { apiClient } from '../../../services/apiClient';
export type ProductSupplier = Record<string, any>;
export const productSuppliersApi = {
  list:()=>apiClient.get<ProductSupplier[]>('/product-suppliers'),
  create:(data:Record<string,unknown>)=>apiClient.post<ProductSupplier>('/product-suppliers',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ProductSupplier>(`/product-suppliers/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ProductSupplier>(`/product-suppliers/${id}/deactivate`)
};
