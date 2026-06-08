import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supportApi, adminSupportApi } from './api';
import { showSuccess, showError } from '@/shared/lib/toast';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export const SUPPORT_KEYS = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tickets: (filters?: Record<string, any>) => ['support', 'tickets', filters] as const,
  ticket: (id: number) => ['support', 'ticket', id] as const,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminTickets: (filters?: Record<string, any>) => ['support', 'admin-tickets', filters] as const,
  adminTicket: (id: number) => ['support', 'admin-ticket', id] as const,
  adminStats: () => ['support', 'admin-stats'] as const,
};

// ─── Tenant hooks ───

export function useMyTickets(params?: { status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: SUPPORT_KEYS.tickets(params),
    queryFn: () => supportApi.listTickets(params),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useTicketDetail(id: number | null) {
  return useQuery({
    queryKey: SUPPORT_KEYS.ticket(id!),
    queryFn: () => supportApi.getTicket(id!),
    enabled: !!id,
  });
}

export function useCreateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: supportApi.createTicket,
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: ['support'] });
      showSuccess(`Ticket ${ticket.ticketNumber} created`);
    },
    onError: (error: Error) => {
      showError('Failed to create ticket', extractErrorMessage(error));
    },
  });
}

export function useAddTicketMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, content }: { ticketId: number; content: string }) =>
      supportApi.addMessage(ticketId, content),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: SUPPORT_KEYS.ticket(variables.ticketId),
      });
      showSuccess('Reply sent');
    },
    onError: (error: Error) => {
      showError('Failed to send reply', extractErrorMessage(error));
    },
  });
}

// ─── Super Admin hooks ───

export function useAdminTickets(params?: {
  tenantId?: number;
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: SUPPORT_KEYS.adminTickets(params),
    queryFn: () => adminSupportApi.listTickets(params),
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useAdminTicketDetail(id: number | null) {
  return useQuery({
    queryKey: SUPPORT_KEYS.adminTicket(id!),
    queryFn: () => adminSupportApi.getTicket(id!),
    enabled: !!id,
  });
}

export function useAdminUpdateTicket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; status?: string; priority?: string; category?: string }) =>
      adminSupportApi.updateTicket(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support'] });
      showSuccess('Ticket updated');
    },
    onError: (error: Error) => {
      showError('Failed to update ticket', extractErrorMessage(error));
    },
  });
}

export function useAdminAddMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, content, isInternal }: { ticketId: number; content: string; isInternal?: boolean }) =>
      adminSupportApi.addMessage(ticketId, content, isInternal),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: SUPPORT_KEYS.adminTicket(variables.ticketId),
      });
      showSuccess(variables.isInternal ? 'Internal note added' : 'Reply sent');
    },
    onError: (error: Error) => {
      showError('Failed to send message', extractErrorMessage(error));
    },
  });
}

export function useAdminSupportStats() {
  return useQuery({
    queryKey: SUPPORT_KEYS.adminStats(),
    queryFn: adminSupportApi.getStats,
    ...QUERY_TIERS.OPERATIONAL,
  });
}

export function useAdminSupportTenants() {
  return useQuery({
    queryKey: ['support', 'admin-tenants'] as const,
    queryFn: adminSupportApi.getTenants,
    ...QUERY_TIERS.STATIC,
  });
}
