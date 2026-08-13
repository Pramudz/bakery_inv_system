import { apiClient } from '../../services/apiClient';
import type { PlatformLoginResponse } from './auth.types';

export interface PlatformLoginRequest {
  username: string;
  password: string;
}

export function platformLogin(data: PlatformLoginRequest) {
  return apiClient.post<PlatformLoginResponse>('/auth/login', data);
}
