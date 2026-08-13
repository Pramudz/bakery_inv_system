import { apiClient } from '../../../services/apiClient';
export type ModuleEntity=Record<string,any>;
export const modulesApi={
  list:()=>apiClient.get<ModuleEntity[]>('/modules'),
  create:(data:Record<string,unknown>)=>apiClient.post<ModuleEntity>('/modules',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ModuleEntity>(`/modules/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ModuleEntity>(`/modules/${id}/deactivate`)
};
