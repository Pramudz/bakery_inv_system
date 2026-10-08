import { apiClient } from '../../../services/apiClient';

export type PosPrintStatus = { jobId: number | null; status: 'PENDING' | 'CLAIMED' | 'PRINTED' | 'FAILED' | 'NOT_REQUESTED'; attempts: number; lastError: string | null; updatedAt: string | null };

export const posPrintStatusApi = {
  get: (documentType: 'SALE' | 'REFUND', id: number) => apiClient.get<PosPrintStatus>(`/pos-print/documents/${documentType}/${id}/status`),
  print: (documentType: 'SALE' | 'REFUND', id: number) => apiClient.post<{ jobId: number; status: string; reprint: boolean }>(`/pos-print/documents/${documentType}/${id}/print`, {}),
};
