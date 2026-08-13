import { apiClient } from '../../../services/apiClient';
export type ProductAttributes=Record<string,any>;
export const productAttributesApi={
  list:()=>apiClient.get<ProductAttributes[]>('/product-attributes'),
  create:(data:Record<string,unknown>)=>apiClient.post<ProductAttributes>('/product-attributes',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ProductAttributes>(`/product-attributes/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ProductAttributes>(`/product-attributes/${id}/deactivate`)
};
