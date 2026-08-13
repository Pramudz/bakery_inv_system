import { apiClient } from '../../../services/apiClient';
export type IdentifierType = Record<string, any>;
export const identifierTypesApi = {
  list:()=>apiClient.get<IdentifierType[]>('/identifier-types'),
  create:(data:Record<string,unknown>)=>apiClient.post<IdentifierType>('/identifier-types',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<IdentifierType>(`/identifier-types/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<IdentifierType>(`/identifier-types/${id}/deactivate`)
};
