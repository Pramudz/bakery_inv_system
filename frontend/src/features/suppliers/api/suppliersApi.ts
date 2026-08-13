import { apiClient } from '../../../services/apiClient';
export type Supplier = Record<string, any>;
export const suppliersApi = {
  list:()=>apiClient.get<Supplier[]>('/suppliers'),
  create:(data:Record<string,unknown>)=>apiClient.post<Supplier>('/suppliers',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Supplier>(`/suppliers/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Supplier>(`/suppliers/${id}/deactivate`)
};
