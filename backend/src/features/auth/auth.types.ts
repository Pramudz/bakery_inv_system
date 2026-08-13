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
  roleId: number;
  roleCode: string;
  accessScope: 'TENANT' | 'LOCATION';
  assignedLocationIds: number[];
}

export type AuthPrincipal =
  | PlatformPrincipal
  | TenantPrincipal;


export interface AuthenticatedRequest extends Request {
  user?: AuthPrincipal;
}
