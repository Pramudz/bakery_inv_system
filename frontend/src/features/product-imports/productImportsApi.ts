import { apiClient } from '../../services/apiClient';

export type ProductImportType = 'onboarding' | 'products' | 'product-units' | 'identifiers' | 'selling-prices' |
  'selling-discounts' | 'product-suppliers' | 'supplier-units' | 'supplier-prices' | 'product-locations' | 'product-attributes';
export interface ProductImportRow {
  sheet: ProductImportType; rowNumber: number; values: Record<string, string>; sku: string;
  action: 'CREATE' | 'UPDATE' | 'REVISE' | 'END' | 'SKIP' | 'ERROR';
  status: 'READY' | 'COMPLETED' | 'SKIPPED' | 'ERROR'; details: string;
  oldValue?: string; newValue?: string; oldEnd?: string; newStart?: string;
}
export interface ProductImportPreview {
  batchId: number; importType: ProductImportType; datasetId: string; status: 'PREVIEW' | 'COMPLETED';
  counts: Record<'create' | 'update' | 'revise' | 'end' | 'skip' | 'error', number>;
  rows: ProductImportRow[];
}
export interface ProductImportHistory { batchId: number; datasetId: string; status: 'PREVIEW' | 'COMPLETED'; createdAt: string; completedAt: string | null }
export interface ProductImportHistoryPage { items: ProductImportHistory[]; page: number; limit: 20 | 50 | 100; totalCount: number; totalPages: number }

export const productImportsApi = {
  template: (type: ProductImportType, sample: boolean) => apiClient.getBlob(`/product-imports/${type}/template?sample=${sample}`),
  preview: (type: ProductImportType, datasetId: string, file: File) => {
    const form = new FormData(); form.append('file', file); form.append('datasetId', datasetId);
    return apiClient.postForm<ProductImportPreview>(`/product-imports/${type}/preview`, form);
  },
  confirm: (type: ProductImportType, batchId: number) => apiClient.post<ProductImportPreview>(`/product-imports/${type}/${batchId}/confirm`, {}),
  get: (type: ProductImportType, batchId: number) => apiClient.get<ProductImportPreview>(`/product-imports/${type}/${batchId}`),
  history: (type: ProductImportType, page = 1, limit: 20 | 50 | 100 = 20) =>
    apiClient.get<ProductImportHistoryPage>(`/product-imports/${type}/history?page=${page}&limit=${limit}`),
  validationReport: (type: ProductImportType, batchId: number) => apiClient.getBlob(`/product-imports/${type}/${batchId}/validation-report`),
  results: (type: ProductImportType, batchId: number) => apiClient.getBlob(`/product-imports/${type}/${batchId}/results`),
};
