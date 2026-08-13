import { apiClient } from '../../../services/apiClient';
export type Tenant = Record<string, any>;
export const tenantsApi = {
  list:()=>apiClient.get<Tenant[]>('/tenants'),
  create:(data:Record<string,unknown>)=>apiClient.post<Tenant>('/tenants',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Tenant>(`/tenants/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Tenant>(`/tenants/${id}/deactivate`),
  activate:(id:number)=>apiClient.patch<Tenant>(`/tenants/${id}/activate`),
  listModules:(id:number)=>apiClient.get<Record<string,any>[]>(`/tenants/${id}/modules`),
  setModuleEnabled:(tenantId:number,moduleId:number,isEnabled:boolean)=>apiClient.put(`/tenants/${tenantId}/modules/${moduleId}`,{isEnabled})
};
