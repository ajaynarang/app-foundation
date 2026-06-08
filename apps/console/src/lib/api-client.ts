import { useAuthStore } from './auth-store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Shared refresh promise to deduplicate concurrent 401 refresh attempts
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // sends httpOnly refreshToken cookie
      });

      if (response.ok) {
        const data = await response.json();
        if (data?.accessToken) {
          useAuthStore.getState().setTokens(data.accessToken);
          return data.accessToken as string;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

interface ApiClientOptions extends RequestInit {
  _isRetry?: boolean;
}

export async function apiClient<T = unknown>(path: string, options: ApiClientOptions = {}): Promise<T> {
  const { _isRetry, ...fetchOptions } = options;
  const accessToken = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...fetchOptions,
    headers,
    credentials: 'include',
  });

  // Handle 401 — attempt token refresh before giving up
  if (response.status === 401 && !_isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Retry the original request once with the new access token
      return apiClient<T>(path, { ...options, _isRetry: true });
    }
    // Refresh failed — session is truly expired, redirect to re-auth
    await useAuthStore.getState().signOut();
    if (typeof window !== 'undefined') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
      const returnTo = encodeURIComponent(window.location.href);
      window.location.href = `${appUrl}/login?returnTo=${returnTo}`;
    }
    throw new ApiError(401, 'Session expired. Please login again.');
  }

  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      // ignore parse errors
    }
    const message =
      (data &&
      typeof data === 'object' &&
      'message' in data &&
      typeof (data as { message: unknown }).message === 'string'
        ? (data as { message: string }).message
        : undefined) ?? response.statusText;
    throw new ApiError(response.status, message, data);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

export const api = {
  get: <T = unknown>(path: string) => apiClient<T>(path),
  post: <T = unknown>(path: string, data?: unknown) =>
    apiClient<T>(path, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),
  put: <T = unknown>(path: string, data?: unknown) =>
    apiClient<T>(path, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),
  patch: <T = unknown>(path: string, data?: unknown) =>
    apiClient<T>(path, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),
  delete: <T = unknown>(path: string) => apiClient<T>(path, { method: 'DELETE' }),
};
