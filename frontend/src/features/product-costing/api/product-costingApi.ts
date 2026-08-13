import { apiClient } from '../../../services/apiClient';
export type ProductSupplierPrice = Record<string, any>;
export const productCostingApi = {
  list:()=>apiClient.get<ProductSupplierPrice[]>('/product-supplier-prices'),
  create:(data:Record<string,unknown>)=>apiClient.post<ProductSupplierPrice>('/product-supplier-prices',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ProductSupplierPrice>(`/product-supplier-prices/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ProductSupplierPrice>(`/product-supplier-prices/${id}/deactivate`)
};
