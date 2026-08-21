import { apiClient } from '../../../services/apiClient';
export type Category = Record<string, any>;
export type CategoryPage = {
  items: Category[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export const categoriesApi = {
  list:()=>apiClient.get<Category[]>('/categories'),
  page:(params:{page:number;limit:number;search:string;status:string})=>apiClient.get<CategoryPage>(`/categories?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}&status=${params.status}`),
  create:(data:Record<string,unknown>)=>apiClient.post<Category>('/categories',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Category>(`/categories/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Category>(`/categories/${id}/deactivate`),
  activate:(id:number)=>apiClient.patch<Category>(`/categories/${id}/activate`)
};
