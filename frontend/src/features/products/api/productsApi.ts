import { apiClient } from "../../../services/apiClient";
export type Product = Record<string, any>;
export type ProductPage = {
  items: Product[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};
export type SellingPriceSummary = Record<string, any>;
export type SellingPriceHistoryPage = { items: Record<string, any>[]; page: number; limit: number; totalItems: number; totalPages: number };
export type SupplierPriceSummary = Record<string, any>;
export type SupplierPriceHistoryPage = { items: Record<string, any>[]; page: number; limit: number; totalItems: number; totalPages: number };
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
  sellingPriceSummary: (productId: number) => apiClient.get<SellingPriceSummary[]>(`/products/${productId}/selling-prices/summary`),
  sellingPriceHistory: (productId: number, params: Record<string, string | number>) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "").map(([key, value]) => [key, String(value)])).toString();
    return apiClient.get<SellingPriceHistoryPage>(`/products/${productId}/selling-prices/history?${query}`);
  },
  publishSellingPrices: (productId: number, actions: Record<string, unknown>[]) =>
    apiClient.post<SellingPriceSummary[]>(`/products/${productId}/selling-prices/publish`, { actions }),
  create: (data: Record<string, unknown>) =>
    apiClient.post<Product>("/products", data),
  update: (id: number, data: Record<string, unknown>) =>
    apiClient.put<Product>(`/products/${id}`, data),
  updateGeneral: (id: number, data: Record<string, unknown>) =>
    apiClient.patch<Product>(`/products/${id}/general`, data),
  updateUnits: (id: number, units: Record<string, unknown>[]) =>
    apiClient.put<Product>(`/products/${id}/units`, { units }),
  updateIdentifiers: (id: number, identifiers: Record<string, unknown>[]) =>
    apiClient.put<Product>(`/products/${id}/identifiers`, { identifiers }),
  updateLocations: (id: number, locations: Record<string, unknown>[]) =>
    apiClient.put<Product>(`/products/${id}/locations`, { locations }),
  updateAttributes: (id: number, attributes: Record<string, unknown>[]) =>
    apiClient.put<Product>(`/products/${id}/attributes`, { attributes }),
  updateSuppliers: (id: number, suppliers: Record<string, unknown>[]) =>
    apiClient.put<Product>(`/products/${id}/suppliers`, { suppliers }),
  supplierPriceSummary: (productId: number) => apiClient.get<SupplierPriceSummary[]>(`/products/${productId}/supplier-prices/summary`),
  supplierPriceHistory: (productId: number, params: Record<string, string | number>) => {
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== "").map(([key, value]) => [key, String(value)])).toString();
    return apiClient.get<SupplierPriceHistoryPage>(`/products/${productId}/supplier-prices/history?${query}`);
  },
  publishSupplierPrices: (id: number, actions: Record<string, unknown>[]) =>
    apiClient.post<SupplierPriceSummary[]>(`/products/${id}/supplier-prices/publish`, { actions }),
  productSupplierUnits: (productSupplierId?: number) => apiClient.get<any[]>(productSupplierId ? `/product-supplier-units/product-supplier/${productSupplierId}` : '/product-supplier-units'),
  createProductSupplierUnit: (data: Record<string, unknown>) => apiClient.post<any>('/product-supplier-units', data),
  updateProductSupplierUnit: (id: number, data: Record<string, unknown>) => apiClient.put<any>(`/product-supplier-units/${id}`, data),
  activateProductSupplierUnit: (id: number) => apiClient.patch<any>(`/product-supplier-units/${id}/activate`),
  deactivateProductSupplierUnit: (id: number) => apiClient.patch<any>(`/product-supplier-units/${id}/deactivate`),
  listImages: (productId: number) =>
    apiClient.get<any[]>(`/products/${productId}/images`),
  addImage: (productId: number, data: Record<string, unknown>) =>
    apiClient.post(`/products/${productId}/images`, data),
  updateImage: (productId: number, imageId: number, data: Record<string, unknown>) =>
    apiClient.patch(`/products/${productId}/images/${imageId}`, data),
  deactivateImage: (productId: number, imageId: number) =>
    apiClient.patch(`/products/${productId}/images/${imageId}/deactivate`),
  checkSellingPriceDeletion: (productId: number, priceId: number) =>
    apiClient.get<{ canDelete: boolean }>(`/products/${productId}/prices/selling/${priceId}/deletion-check`),
  checkSupplierPriceDeletion: (productId: number, priceId: number) =>
    apiClient.get<{ canDelete: boolean }>(`/products/${productId}/prices/supplier/${priceId}/deletion-check`),
  deactivate: (id: number) =>
    apiClient.patch<Product>(`/products/${id}/deactivate`),
  activate: (id: number) =>
    apiClient.patch<Product>(`/products/${id}/activate`),
};
