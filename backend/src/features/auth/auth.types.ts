import { Request } from 'express';
export type AuthScope = 'PLATFORM' | 'TENANT';

export interface PlatformPrincipal {
  scope: 'PLATFORM';
  platformUserId: number;
  username: string;
}

export interface TenantPrincipal {
  scope: 'TENANT';
  userId: number;
  tenantId: number;
  username: string;
}

export type AuthPrincipal =
  | PlatformPrincipal
  | TenantPrincipal;


export interface AuthenticatedRequest extends Request {
  user?: AuthPrincipal;
}