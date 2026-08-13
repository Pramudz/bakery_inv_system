import { env } from '../config/env';
import {
  AUTH_TOKEN_KEY,
  AUTH_UNAUTHORIZED_EVENT,
} from '../features/auth/auth.types';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${env.apiUrl}${path}`, {
    ...options,
    headers,
  });

  const contentType =
    response.headers.get('content-type') ?? '';

  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message =
      typeof body === 'object' &&
      body !== null &&
      'message' in body
        ? Array.isArray(body.message)
          ? body.message.join(', ')
          : String(body.message)
        : `Request failed (${response.status})`;

    if (response.status === 401) {
      window.dispatchEvent(
        new CustomEvent(AUTH_UNAUTHORIZED_EVENT),
      );
    }

    throw new ApiError(
      response.status,
      message,
      body,
    );
  }

  return body as T;
}

export const apiClient = {
  get: <T>(path: string) =>
    request<T>(path),

  post: <T>(
    path: string,
    data: unknown,
  ) =>
    request<T>(path, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  put: <T>(
    path: string,
    data: unknown,
  ) =>
    request<T>(path, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  patch: <T>(
    path: string,
    data?: unknown,
  ) =>
    request<T>(path, {
      method: 'PATCH',
      body:
        data === undefined
          ? undefined
          : JSON.stringify(data),
    }),
};
