import { apiClient } from '../../../services/apiClient';
export type IdentifierType = Record<string, any>;
export const identifierTypesApi = {
  list:()=>apiClient.get<IdentifierType[]>('/identifier-types'),
};
export const platformIdentifierTypesApi = {
  list:()=>apiClient.get<IdentifierType[]>('/platform/identifier-types'),
  create:(data:Record<string,unknown>)=>apiClient.post<IdentifierType>('/platform/identifier-types',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<IdentifierType>(`/platform/identifier-types/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<IdentifierType>(`/platform/identifier-types/${id}/deactivate`)
};
