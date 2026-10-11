import { apiClient } from '../../../services/apiClient';
export type ModuleEntity=Record<string,any>;
export const modulesApi={
  list:()=>apiClient.get<ModuleEntity[]>('/modules'),
};
export const platformModulesApi={
  list:()=>apiClient.get<ModuleEntity[]>('/platform/modules'),
  create:(data:Record<string,unknown>)=>apiClient.post<ModuleEntity>('/platform/modules',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<ModuleEntity>(`/platform/modules/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<ModuleEntity>(`/platform/modules/${id}/deactivate`)
};
