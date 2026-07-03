/**
 * API client with JWT authentication and automatic token refresh.
 *
 * Key design decisions:
 * - Access token stored in Zustand (memory + localStorage)
 * - Refresh token stored as httpOnly cookie (set by backend)
 * - Concurrent 401s are deduplicated via a shared refresh promise
 */

import { getSessionStore } from '@appshore/web-core/auth/session-bridge';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(
    public status: number,
    message: string,
    public data?: any,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Internal options extension for retry tracking — not part of public API. */
interface ApiClientOptions extends RequestInit {
  _isRetry?: boolean;
}

/**
 * Shared refresh promise so concurrent 401s don't each fire their own
 * /auth/refresh request. The first caller creates the promise; subsequent
 * callers await the same one.
 */
let refreshPromise: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // sends httpOnly refreshToken cookie
      });

      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        if (data?.accessToken) {
          const store = getSessionStore().getState();
          store.setTokens(data.accessToken);
          // Refresh also returns updated user — sync store + renew auth cookie
          if (data.user) {
            store.setUser(data.user);
          }
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiClient<T = any>(url: string, options: ApiClientOptions = {}): Promise<T> {
  const { _isRetry, ...fetchOptions } = options;

  // Get token from authStore directly (not a React hook, so use store access)
  const accessToken = getSessionStore().getState().accessToken;

  // Add Authorization header
  const headers = {
    'Content-Type': 'application/json',
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...fetchOptions.headers,
  };

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...fetchOptions,
    headers,
    credentials: 'include', // Include httpOnly cookies
  });

  // Handle 401 (token expired) — attempt refresh before signing out
  if (response.status === 401 && !_isRetry) {
    const newToken = await refreshAccessToken();

    if (newToken) {
      // Retry original request once with the new access token
      return apiClient<T>(url, { ...options, _isRetry: true });
    }

    // Refresh failed — session is truly expired
    await getSessionStore().getState().signOut();
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    throw new ApiError(401, 'Session expired. Please login again.');
  }

  // Handle other errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: `Request failed with status ${response.status}`,
    }));
    throw new ApiError(
      response.status,
      error.detail || error.message || 'Request failed',
      error, // Full response object — includes fieldErrors, debugDetail (dev), etc.
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// Convenience methods
const apiMethods = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: <T = any>(url: string, options?: ApiClientOptions) => apiClient<T>(url, { ...options, method: 'GET' }),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  post: <T = any>(url: string, data?: any, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  put: <T = any>(url: string, data?: any, options?: ApiClientOptions) =>
    apiClient<T>(url, {
      ...options,
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    }),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete: <T = any>(url: string, options?: ApiClientOptions) => apiClient<T>(url, { ...options, method: 'DELETE' }),
};

// Export combined API object.
// Feature-specific sub-modules can be merged here by the feature that owns them.
export const api = {
  ...apiMethods,
};
