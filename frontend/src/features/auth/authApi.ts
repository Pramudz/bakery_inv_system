import { apiClient } from '../../services/apiClient';
import type { PlatformLoginResponse, TenantLoginResponse } from './auth.types';
export interface PlatformLoginRequest { username: string; password: string; }
export interface TenantLoginRequest { tenantCode: string; username: string; password: string; }
export function platformLogin(data: PlatformLoginRequest) { return apiClient.post<PlatformLoginResponse>('/auth/login', data); }
export function tenantLogin(data: TenantLoginRequest) { return apiClient.post<TenantLoginResponse>('/auth/tenant-login', data); }
export function logoutSession(scope: 'PLATFORM' | 'TENANT') { return apiClient.post<{ revoked: boolean }>(scope === 'PLATFORM' ? '/auth/logout' : '/auth/tenant-logout', {}); }
