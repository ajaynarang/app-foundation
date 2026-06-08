import { apiClient } from '@/shared/lib/api';
import type {
  Customer,
  CustomerCreate,
  CustomerUpdate,
  CustomerContact,
  ContactCreate,
  ContactUpdate,
  CustomerInvite,
  CustomerInviteResponse,
} from './types';

export const customersApi = {
  // Customer CRUD
  list: async (): Promise<Customer[]> => apiClient<Customer[]>('/customers/'),
  getById: async (id: string): Promise<Customer> => apiClient<Customer>(`/customers/${id}`),
  create: async (data: CustomerCreate): Promise<Customer> =>
    apiClient<Customer>('/customers/', { method: 'POST', body: JSON.stringify(data) }),
  update: async (id: string, data: CustomerUpdate): Promise<Customer> =>
    apiClient<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  invite: async (customerId: string, data: CustomerInvite): Promise<CustomerInviteResponse> =>
    apiClient<CustomerInviteResponse>(`/customers/${customerId}/invite`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Contact CRUD
  listContacts: async (customerId: string): Promise<CustomerContact[]> =>
    apiClient<CustomerContact[]>(`/customers/${customerId}/contacts`),
  createContact: async (customerId: string, data: ContactCreate): Promise<CustomerContact> =>
    apiClient<CustomerContact>(`/customers/${customerId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateContact: async (customerId: string, contactId: string, data: ContactUpdate): Promise<CustomerContact> =>
    apiClient<CustomerContact>(`/customers/${customerId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteContact: async (customerId: string, contactId: string): Promise<void> =>
    apiClient<void>(`/customers/${customerId}/contacts/${contactId}`, { method: 'DELETE' }),

  // Lifecycle operations
  deactivate: async (customerId: string, reason: string) => {
    return apiClient(`/customers/${customerId}/deactivate`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },
  reactivate: async (customerId: string) => {
    return apiClient(`/customers/${customerId}/reactivate`, { method: 'POST' });
  },
  listWithInactive: async (): Promise<Customer[]> => {
    return apiClient<Customer[]>('/customers/?includeInactive=true');
  },
};
