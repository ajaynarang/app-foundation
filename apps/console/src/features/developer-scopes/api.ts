import { api } from '../../lib/api-client';

export interface DeveloperScopeEntry {
  scope: string;
  summary: string;
  grantsPlainEnglish: string;
  hitlTier: 'none' | 'standard' | 'sensitive';
  sampleTools: string[];
}

export async function listDeveloperScopes(): Promise<DeveloperScopeEntry[]> {
  return api.get<DeveloperScopeEntry[]>('/developer/scopes');
}
