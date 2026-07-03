import { apiClient } from '@appshore/web-core/shared/lib/api';

export interface WorkspaceSummary {
  tenantId: string;
  name: string;
  subdomain: string | null;
  role: string;
  isDefault: boolean;
}

export const workspacesApi = {
  list(): Promise<{ workspaces: WorkspaceSummary[] }> {
    return apiClient('/workspaces');
  },

  switch(tenantId: string): Promise<{ accessToken: string; workspace: WorkspaceSummary }> {
    return apiClient('/workspaces/switch', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    });
  },
};
