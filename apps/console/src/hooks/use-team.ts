'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, apiClient } from '../lib/api-client';
import { showSuccess, showError } from '@sally/ui';

export interface TeamMember {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Invitation {
  id: string;
  email: string | null;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export function useTeamMembers() {
  return useQuery<TeamMember[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
  });
}

export function useInvitations() {
  return useQuery<Invitation[]>({
    queryKey: ['invitations'],
    queryFn: () => api.get('/invitations'),
  });
}

export function useCancelInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient(`/invitations/${id}`, {
        method: 'DELETE',
        body: JSON.stringify({ reason: 'Cancelled by admin' }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      showSuccess('Invitation cancelled');
    },
    onError: (e: Error) => showError('Failed to cancel invitation', e.message),
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/invitations/${id}/resend`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invitations'] });
      showSuccess('Invitation resent');
    },
    onError: (e: Error) => showError('Failed to resend', e.message),
  });
}
