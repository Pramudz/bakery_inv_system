import { apiClient } from '../../services/apiClient';

export interface OpeningRow {
  rowNumber: number; values: Record<'LocationCode' | 'SKU' | 'UnitCode' | 'Quantity' | 'BaseUnitCost' | 'Remarks' | 'RowReference', string>;
  status: 'READY' | 'ERROR' | 'POSTED'; details: string; productName?: string; baseUnitCode?: string;
  conversionFactor?: string; baseQuantity?: string; openingValue?: string;
  existingQuantity?: string; existingWavg?: string; historicalMovement?: boolean; openingClaim?: boolean;
  postingDate?: string; adjustmentNumber?: string; ledgerId?: number; finalQuantity?: string; finalWavg?: string;
}
export interface OpeningPreview {
  batchId: number; datasetId: string; status: 'PREVIEW' | 'COMPLETED'; rows: OpeningRow[];
  summary: { totalRows: number; readyRows: number; errorRows: number; postedRows: number;
    locationsAffected: number; baseQuantitiesByUnit: Record<string, string>; totalOpeningValue: string };
}
export interface OpeningHistoryPage {
  items: Array<{ batchId: number; datasetId: string; status: 'PREVIEW' | 'COMPLETED'; createdAt: string; completedAt: string | null }>;
  page: number; limit: 20 | 50 | 100; totalCount: number; totalPages: number;
}
const path = '/opening-inventory-imports';
export const openingInventoryImportsApi = {
  template: (sample: boolean) => apiClient.getBlob(`${path}/template?sample=${sample}`),
  preview: (datasetId: string, file: File) => {
    const form = new FormData(); form.append('datasetId', datasetId); form.append('file', file);
    return apiClient.postForm<OpeningPreview>(`${path}/preview`, form);
  },
  confirm: (batchId: number) => apiClient.post<OpeningPreview>(`${path}/${batchId}/confirm`, {}),
  get: (batchId: number) => apiClient.get<OpeningPreview>(`${path}/${batchId}`),
  history: (page = 1, limit: 20 | 50 | 100 = 20) => apiClient.get<OpeningHistoryPage>(`${path}/history?page=${page}&limit=${limit}`),
  validationReport: (batchId: number) => apiClient.getBlob(`${path}/${batchId}/validation-report`),
  results: (batchId: number) => apiClient.getBlob(`${path}/${batchId}/results`),
};
