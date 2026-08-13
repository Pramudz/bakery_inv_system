import { apiClient } from '../../../services/apiClient';
export type Attribute=Record<string,any>;
export const attributesApi={
  list:()=>apiClient.get<Attribute[]>('/attributes'),
  create:(data:Record<string,unknown>)=>apiClient.post<Attribute>('/attributes',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Attribute>(`/attributes/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Attribute>(`/attributes/${id}/deactivate`)
};
