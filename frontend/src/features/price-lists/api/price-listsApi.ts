import { apiClient } from '../../../services/apiClient';
export type PriceList=Record<string,any>;
export const priceListsApi={
  list:()=>apiClient.get<PriceList[]>('/price-lists'),
  create:(data:Record<string,unknown>)=>apiClient.post<PriceList>('/price-lists',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<PriceList>(`/price-lists/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<PriceList>(`/price-lists/${id}/deactivate`)
};
