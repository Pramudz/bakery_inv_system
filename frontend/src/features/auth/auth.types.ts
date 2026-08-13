export type AuthScope = 'PLATFORM' | 'TENANT';

export interface PlatformUser { platformUserId: string; username: string; email: string | null; firstName: string | null; lastName: string | null; mobile: string | null; }
export interface TenantSummary { tenantId: string; tenantCode: string; tenantName: string; }
export interface TenantUser { userId: string; username: string; email: string | null; firstName: string | null; lastName: string | null; mobile: string | null; }
export interface TenantRole { roleId: string; code: string; name: string; }
export interface PlatformLoginResponse { accessToken: string; scope: 'PLATFORM'; platformUser: PlatformUser; expiresAt: string; }
export interface TenantLoginResponse { accessToken: string; scope: 'TENANT'; tenant: TenantSummary; user: TenantUser; roles: TenantRole[]; expiresAt: string; }
export interface AuthState { accessToken: string | null; scope: AuthScope | null; platformUser: PlatformUser | null; tenant: TenantSummary | null; tenantUser: TenantUser | null; roles: TenantRole[]; expiresAt: string | null; }
export const AUTH_TOKEN_KEY = 'erp_access_token';
export const AUTH_STATE_KEY = 'erp_auth_state';
export const AUTH_UNAUTHORIZED_EVENT = 'erp:unauthorized';
