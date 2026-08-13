export type AuthScope = 'PLATFORM' | 'TENANT';

export interface PlatformUser {
  platformUserId: string;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  mobile: string | null;
}

export interface PlatformLoginResponse {
  accessToken: string;
  scope: 'PLATFORM';
  platformUser: PlatformUser;
  expiresAt: string;
}

export interface AuthState {
  accessToken: string | null;
  scope: AuthScope | null;
  platformUser: PlatformUser | null;
  expiresAt: string | null;
}

export const AUTH_TOKEN_KEY = 'erp_access_token';
export const AUTH_STATE_KEY = 'erp_auth_state';
export const AUTH_UNAUTHORIZED_EVENT = 'erp:unauthorized';
