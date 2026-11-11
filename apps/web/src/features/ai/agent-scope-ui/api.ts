import { apiClient } from '@appshore/web-core/shared/lib/api';
import type { AgentScope, AgentScopeDescription } from '@app/shared-types';

/** One row of `GET /developer/scopes`: a grantable scope with its copy and the tools that use it today. */
export interface ScopeReferenceEntry extends AgentScopeDescription {
  scope: AgentScope;
}

export const developerScopesApi = {
  list: (): Promise<ScopeReferenceEntry[]> => apiClient<ScopeReferenceEntry[]>('/developer/scopes'),
};
