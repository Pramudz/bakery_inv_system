import { apiClient } from "../../../services/apiClient";
export type Product = Record<string, any>;
export type ProductPage = {
  items: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export const productsApi = {
  list: () => apiClient.get<Product[]>("/products"),
  page: (params: {
    page: number;
    limit: number;
    search: string;
    status: string;
  }) =>
    apiClient.get<ProductPage>(
      `/products?page=${params.page}&limit=${params.limit}&search=${encodeURIComponent(params.search)}&status=${params.status}`,
    ),
  get: (id: number) => apiClient.get<Product>(`/products/${id}`),
  create: (data: Record<string, unknown>) =>
    apiClient.post<Product>("/products", data),
  update: (id: number, data: Record<string, unknown>) =>
    apiClient.put<Product>(`/products/${id}`, data),
  deactivate: (id: number) =>
    apiClient.patch<Product>(`/products/${id}/deactivate`),
  activate: (id: number) =>
    apiClient.patch<Product>(`/products/${id}/activate`),
};
