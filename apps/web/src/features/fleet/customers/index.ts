export { customersApi } from './api';
export { CustomerList } from './components/customer-list';
export { InviteCustomerDialog } from './components/invite-customer-dialog';
export { CustomerPicker } from './components/customer-picker';
export { CreateCustomerSheet } from './components/create-customer-sheet';
export { CustomerDetailSheet } from './components/customer-detail-sheet';
export {
  useCustomers,
  useCustomerById,
  useCreateCustomer,
  useUpdateCustomer,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useDeactivateCustomer,
  useReactivateCustomer,
} from './hooks/use-customers';
export type {
  Customer,
  CustomerCreate,
  CustomerUpdate,
  CustomerContact,
  ContactCreate,
  ContactUpdate,
  CustomerInvite,
  CustomerInviteResponse,
  CustomerType,
  CustomerStatus,
  PaymentTerms,
  ContactRole,
} from './types';
