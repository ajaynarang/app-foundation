import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { customersApi } from '../api';
import type { CustomerCreate, CustomerUpdate, ContactCreate, ContactUpdate } from '../types';
import { showSuccess, showError } from '@sally/ui';
import { queryKeys } from '@/shared/constants';
import { extractErrorMessage } from '@/shared/lib/error-utils';

export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers.root,
    queryFn: () => customersApi.listWithInactive(),
  });
}

export function useCustomerById(customerId: string) {
  return useQuery({
    queryKey: [...queryKeys.customers.root, customerId],
    queryFn: () => customersApi.getById(customerId),
    enabled: !!customerId,
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CustomerCreate) => customersApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      showSuccess('Customer created');
    },
    onError: (error: Error) => {
      showError('Failed to create customer', extractErrorMessage(error));
    },
  });
}

export function useUpdateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, data }: { customerId: string; data: CustomerUpdate }) =>
      customersApi.update(customerId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.customers.root, variables.customerId] });
      showSuccess('Customer updated');
    },
    onError: (error: Error) => {
      showError('Failed to update customer', extractErrorMessage(error));
    },
  });
}

// Contact mutations
export function useCreateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, data }: { customerId: string; data: ContactCreate }) =>
      customersApi.createContact(customerId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      showSuccess('Contact added');
    },
    onError: (error: Error) => {
      showError('Failed to add contact', extractErrorMessage(error));
    },
  });
}

export function useUpdateContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, contactId, data }: { customerId: string; contactId: string; data: ContactUpdate }) =>
      customersApi.updateContact(customerId, contactId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      showSuccess('Contact updated');
    },
    onError: (error: Error) => {
      showError('Failed to update contact', extractErrorMessage(error));
    },
  });
}

export function useDeleteContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, contactId }: { customerId: string; contactId: string }) =>
      customersApi.deleteContact(customerId, contactId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      showSuccess('Contact deleted');
    },
    onError: (error: Error) => {
      showError('Failed to delete contact', extractErrorMessage(error));
    },
  });
}

export function useDeactivateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ customerId, reason }: { customerId: string; reason: string }) =>
      customersApi.deactivate(customerId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      showSuccess('Customer deactivated');
    },
    onError: (error: Error) => {
      showError('Failed to deactivate customer', extractErrorMessage(error));
    },
  });
}

export function useReactivateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (customerId: string) => customersApi.reactivate(customerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.root });
      showSuccess('Customer reactivated');
    },
    onError: (error: Error) => {
      showError('Failed to reactivate customer', extractErrorMessage(error));
    },
  });
}
