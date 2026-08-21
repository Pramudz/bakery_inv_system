import { apiClient } from '../../../services/apiClient';
export type Brand=Record<string,any>;
export type BrandPage={items:Brand[];page:number;limit:number;total:number;totalPages:number};
export const brandsApi={
  list:()=>apiClient.get<Brand[]>('/brands'),
  page:(params:{page:number;limit:number;search:string;status:string})=>apiClient.get<BrandPage>(`/brands?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}&status=${params.status}`),
  create:(data:Record<string,unknown>)=>apiClient.post<Brand>('/brands',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Brand>(`/brands/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Brand>(`/brands/${id}/deactivate`),
  activate:(id:number)=>apiClient.patch<Brand>(`/brands/${id}/activate`)
};
