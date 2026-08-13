import { apiClient } from '../../../services/apiClient';
export type ProductIdentifier=Record<string,any>;
export const productIdentifiersApi={
  list:()=>apiClient.get<ProductIdentifier[]>('/product-identifiers'),
  create:(data:Record<string,unknown>)=>apiClient.post<ProductIdentifier>('/product-identifiers',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ProductIdentifier>(`/product-identifiers/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ProductIdentifier>(`/product-identifiers/${id}/deactivate`)
};
