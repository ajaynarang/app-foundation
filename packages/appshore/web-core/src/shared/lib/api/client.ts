/**
 * API client with JWT authentication and automatic token refresh.
 *
 * Key design decisions:
 * - Access token stored in Zustand (memory + localStorage)
 * - Refresh token stored as httpOnly cookie (set by backend)
 * - Concurrent 401s are deduplicated via a shared refresh promise
 */

import { getSessionStore } from '@appshore/web-core/auth/session-bridge';
import { resolveRequestId } from '../request-id';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public data?: any,
    /** The id the backend logged this request under (`x-request-id`); tagged on the Sentry event to find its logs. */
    public requestId?: string,
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
    throw new ApiError(401, 'Session expired. Please login again.', undefined, resolveRequestId(response));
  }

  // Handle other errors
  if (!response.ok) {
    const error = await response.json().catch(() => ({
      detail: `Request failed with status ${response.status}`,
    }));
    throw new ApiError(
      response.status,
      error.detail || 'Request failed', // the error envelope's copy is `detail`; there is no `message`
      error, // Full response object — includes fieldErrors, debugDetail (dev), etc.
      resolveRequestId(response),
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  // A 200, 201 or 202 may carry no body either: that is undefined, not a JSON parse error.
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text);
}

/**
 * Authenticated fetch that returns the RAW Response, for binary downloads (files, exports) where the caller needs
 * the headers and the blob, not parsed JSON. Same auth and one-shot 401 refresh as `apiClient`. It sets no
 * `Content-Type`, and it does not throw on a failed status: the caller reads `response.ok`.
 */
export async function apiFetchRaw(url: string, options: ApiClientOptions = {}): Promise<Response> {
  const { _isRetry, ...fetchOptions } = options;
  const accessToken = getSessionStore().getState().accessToken;

  const response = await fetch(`${API_BASE_URL}${url}`, {
    ...fetchOptions,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...fetchOptions.headers,
    },
    credentials: 'include',
  });

  if (response.status === 401 && !_isRetry) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return apiFetchRaw(url, { ...options, _isRetry: true });
    }
    throw new ApiError(401, 'Session expired. Please login again.');
  }

  return response;
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
