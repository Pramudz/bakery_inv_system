import { apiClient } from '../../../services/apiClient';
export type Category = Record<string, any>;
export const categoriesApi = {
  list:()=>apiClient.get<Category[]>('/categories'),
  create:(data:Record<string,unknown>)=>apiClient.post<Category>('/categories',data),
  update:(id:number,data:Record<string,unknown>)=>apiClient.put<Category>(`/categories/${id}`,data),
  deactivate:(id:number)=>apiClient.patch<Category>(`/categories/${id}/deactivate`)
};
