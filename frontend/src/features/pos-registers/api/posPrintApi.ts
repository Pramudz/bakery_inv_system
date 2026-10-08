import { apiClient } from '../../../services/apiClient';

export type PrintProfile = { posPrintProfileId: number; locationId: number; posTerminalId: number | null; displayName: string; transport: 'TCP' | 'WINDOWS_QUEUE'; target: string; port: number | null; paperWidth: 58 | 80; encoding: 'CP437' | 'CP850' | 'UTF8'; cutEnabled: boolean; isActive: boolean };
export type PrintJob = { posPrintJobId: number; posPrintProfileId: number; posTerminalId: number | null; documentType: string; sourceId: number | null; status: string; attempts: number; lastError: string | null; createdAt: string };
export const posPrintApi = {
  profiles: (locationId: number) => apiClient.get<PrintProfile[]>(`/pos-print/profiles?locationId=${locationId}`),
  receiptReadiness: (locationId: number) => apiClient.get<{ companyName: string; locationName: string; address: string[]; warnings: string[] }>(`/pos-print/receipt-readiness?locationId=${locationId}`),
  configure: (data: Omit<PrintProfile, 'posPrintProfileId'>) => apiClient.post<{ profile: PrintProfile; agentToken: string | null }>('/pos-print/profiles', data),
  rotateToken: (id: number) => apiClient.post<{ profile: PrintProfile; agentToken: string }>(`/pos-print/profiles/${id}/rotate-token`, {}),
  test: (id: number) => apiClient.post<PrintJob>(`/pos-print/profiles/${id}/test`, {}),
  jobs: (locationId: number, page = 1, profileId?: number) => apiClient.get<{ items: PrintJob[]; total: number; page: number; pageSize: number }>(`/pos-print/jobs?locationId=${locationId}&page=${page}&pageSize=20${profileId ? `&profileId=${profileId}` : ''}`),
  retry: (id: number) => apiClient.post<PrintJob>(`/pos-print/jobs/${id}/retry`, {}),
};
