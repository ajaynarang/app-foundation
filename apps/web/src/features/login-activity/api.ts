/**
 * Login activity API client — read-only.
 *
 * Two scopes share one shape: tenant admins hit /admin/login-activity,
 * super admins hit /super-admin/login-activity. The path is the only
 * difference, so we resolve it from the LoginActivityScope.
 */

import { apiClient } from '@/shared/lib/api';
import type {
  ListLoginActivityQuery,
  ListLoginActivityResponse,
  LoginActivitySummary,
  LoginActivitySummaryQuery,
  LoginActivityScope,
} from './types';

const basePath = (scope: LoginActivityScope) =>
  scope === 'super' ? '/super-admin/login-activity' : '/admin/login-activity';

function toQuery(input: Record<string, unknown>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined || item === null || item === '') continue;
        usp.append(key, String(item));
      }
    } else {
      usp.append(key, String(value));
    }
  }
  const s = usp.toString();
  return s ? `?${s}` : '';
}

export const loginActivityApi = {
  list: (scope: LoginActivityScope, query: ListLoginActivityQuery) =>
    apiClient<ListLoginActivityResponse>(`${basePath(scope)}${toQuery(query as Record<string, unknown>)}`),

  summary: (scope: LoginActivityScope, query: LoginActivitySummaryQuery) =>
    apiClient<LoginActivitySummary>(`${basePath(scope)}/summary${toQuery(query as Record<string, unknown>)}`),
};
