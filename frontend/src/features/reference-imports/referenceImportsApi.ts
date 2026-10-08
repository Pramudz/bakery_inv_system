import { apiClient } from '../../services/apiClient';

export type ImportMaster = 'categories' | 'brands' | 'units' | 'suppliers' | 'price-lists' | 'locations';
export interface ImportRow { rowNumber: number; action: 'CREATE' | 'SKIP' | 'ERROR'; code: string; errors: string[]; values: Record<string, unknown> }
export interface ImportPreview { batchId: number; master: ImportMaster; status: 'PREVIEW' | 'COMPLETED'; counts: { create: number; skip: number; error: number }; rows: ImportRow[] }

export const referenceImportsApi = {
  template: (master: ImportMaster, sample: boolean) => apiClient.getBlob(`/reference-imports/${master}/template?sample=${sample}`),
  preview: (master: ImportMaster, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.postForm<ImportPreview>(`/reference-imports/${master}/preview`, form);
  },
  confirm: (master: ImportMaster, batchId: number) => apiClient.post<ImportPreview>(`/reference-imports/${master}/${batchId}/confirm`, {}),
  results: (master: ImportMaster, batchId: number) => apiClient.getBlob(`/reference-imports/${master}/${batchId}/results`),
};
