import { apiClient } from '../../../services/apiClient';
export type PriceListItem=Record<string,any>;
export const priceListItemsApi={
  list:()=>apiClient.get<PriceListItem[]>('/price-list-items'),
  create:(data:Record<string,unknown>)=>apiClient.post<PriceListItem>('/price-list-items',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<PriceListItem>(`/price-list-items/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<PriceListItem>(`/price-list-items/${id}/deactivate`)
};
