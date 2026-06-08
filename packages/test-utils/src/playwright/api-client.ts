import type { APIRequestContext, APIResponse } from '@playwright/test';

export interface RoleApiClient {
  get(url: string, options?: Parameters<APIRequestContext['get']>[1]): Promise<APIResponse>;
  post(url: string, data?: unknown, options?: Parameters<APIRequestContext['post']>[1]): Promise<APIResponse>;
  put(url: string, data?: unknown, options?: Parameters<APIRequestContext['put']>[1]): Promise<APIResponse>;
  patch(url: string, data?: unknown, options?: Parameters<APIRequestContext['patch']>[1]): Promise<APIResponse>;
  delete(url: string, options?: Parameters<APIRequestContext['delete']>[1]): Promise<APIResponse>;
  token: string;
  role: string;
}

export function resolveUrl(relativePath: string, baseUrl: string): string {
  if (relativePath.startsWith('http')) return relativePath;
  const base = baseUrl.replace(/\/+$/, '');
  const rel = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  return `${base}${rel}`;
}

export function createRoleClient(
  request: APIRequestContext,
  role: string,
  token: string,
  baseUrl: string,
): RoleApiClient {
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const r = (url: string) => resolveUrl(url, baseUrl);

  return {
    token,
    role,
    get: (url, opts = {}) =>
      request.get(r(url), { ...opts, headers: { ...headers, ...((opts as any)?.headers ?? {}) } }),
    post: (url, data?, opts = {}) =>
      request.post(r(url), { data, ...opts, headers: { ...headers, ...((opts as any)?.headers ?? {}) } }),
    put: (url, data?, opts = {}) =>
      request.put(r(url), { data, ...opts, headers: { ...headers, ...((opts as any)?.headers ?? {}) } }),
    patch: (url, data?, opts = {}) =>
      request.patch(r(url), { data, ...opts, headers: { ...headers, ...((opts as any)?.headers ?? {}) } }),
    delete: (url, opts = {}) =>
      request.delete(r(url), { ...opts, headers: { ...headers, ...((opts as any)?.headers ?? {}) } }),
  };
}
