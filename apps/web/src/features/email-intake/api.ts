import { apiClient } from '@/shared/lib/api';
import type { EmailIngestSettings, EmailIngestThread, EmailThreadsResponse } from './types';

export const emailIntakeApi = {
  listThreads: (params?: Record<string, string>) => {
    const qs = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiClient<EmailThreadsResponse>(`/integrations/email-intake/threads${qs}`);
  },

  confirmThread: (threadId: string, data: Record<string, unknown>) =>
    apiClient<{ loadNumber: string }>(`/integrations/email-intake/threads/${threadId}/confirm`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  discardThread: (threadId: string) =>
    apiClient<EmailIngestThread>(`/integrations/email-intake/threads/${threadId}/discard`, { method: 'POST' }),

  restoreThread: (threadId: string) =>
    apiClient<{ status: string }>(`/integrations/email-intake/threads/${threadId}/restore`, { method: 'POST' }),

  approveSenderAndParse: (threadId: string) =>
    apiClient<{ status: string; domain: string; requeuedCount: number }>(
      `/integrations/email-intake/threads/${threadId}/approve-sender`,
      { method: 'POST' },
    ),

  reparseAttachment: (attachmentId: string) =>
    apiClient<{ requeued: boolean }>(`/integrations/email-intake/attachments/${attachmentId}/reparse`, {
      method: 'POST',
    }),

  getSettings: () => apiClient<EmailIngestSettings>('/integrations/email-intake/settings'),

  updateSettings: (data: Partial<EmailIngestSettings>) =>
    apiClient<EmailIngestSettings>('/integrations/email-intake/settings', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
};
