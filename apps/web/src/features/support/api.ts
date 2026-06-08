import { apiClient } from '@/shared/lib/api';
import type { PaginatedTickets, SupportTicketDetail, SupportTicket, TicketMessage, SupportStats } from './types';

function toQueryString(params: Record<string, string | number | undefined>): string {
  const qp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      qp.set(key, String(value));
    }
  }
  const qs = qp.toString();
  return qs ? `?${qs}` : '';
}

// ─── Tenant API ───

export const supportApi = {
  createTicket: (data: {
    subject: string;
    description: string;
    category?: string;
    priority?: string;
    conversationId?: number;
    relatedEntities?: Array<{ type: string; id: string; label?: string }>;
  }): Promise<SupportTicket> =>
    apiClient('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listTickets: (params?: { status?: string; limit?: number; offset?: number }): Promise<PaginatedTickets> =>
    apiClient(`/support/tickets${toQueryString(params ?? {})}`),

  getTicket: (id: number): Promise<SupportTicketDetail> => apiClient(`/support/tickets/${id}`),

  addMessage: (ticketId: number, content: string): Promise<TicketMessage> =>
    apiClient(`/support/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};

// ─── Super Admin API ───

export const adminSupportApi = {
  listTickets: (params?: {
    tenantId?: number;
    status?: string;
    priority?: string;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<PaginatedTickets> => apiClient(`/support/admin/tickets${toQueryString(params ?? {})}`),

  getTicket: (id: number): Promise<SupportTicketDetail> => apiClient(`/support/admin/tickets/${id}`),

  updateTicket: (id: number, data: { status?: string; priority?: string; category?: string }): Promise<SupportTicket> =>
    apiClient(`/support/admin/tickets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  addMessage: (ticketId: number, content: string, isInternal = false): Promise<TicketMessage> =>
    apiClient(`/support/admin/tickets/${ticketId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, isInternal }),
    }),

  getStats: (): Promise<SupportStats> => apiClient('/support/admin/stats'),

  getTenants: (): Promise<{ id: number; companyName: string }[]> => apiClient('/support/admin/tenants'),
};
