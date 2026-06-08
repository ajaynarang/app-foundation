import { z } from 'zod';
import {
  ContactRole,
  ContactRoleSchema,
  CustomerStatus,
  CustomerStatusSchema,
  CustomerType,
  CustomerTypeSchema,
  PaymentTerms,
  PaymentTermsSchema,
} from '../generated/prisma-enums';
import { BillingPathSchema } from '../financials/invoice.schema';
import { LoadStopStatusSchema } from './stop.schema';

// Customer-related enums re-exported from the codegen mirror.
export {
  ContactRole,
  ContactRoleSchema,
  CustomerStatus,
  CustomerStatusSchema,
  CustomerType,
  CustomerTypeSchema,
  PaymentTerms,
  PaymentTermsSchema,
};

export const CustomerContactSchema = z.object({
  id: z.number(),
  contactId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().optional(),
  phone: z.string().optional(),
  role: ContactRoleSchema,
  isPrimary: z.boolean(),
  title: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const CustomerSchema = z.object({
  id: z.number(),
  customerId: z.string(),
  companyName: z.string(),
  customerType: CustomerTypeSchema,
  status: CustomerStatusSchema,
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  paymentTerms: PaymentTermsSchema.optional(),
  creditLimit: z.number().optional(),
  taxId: z.string().optional(),
  defaultBillingPath: BillingPathSchema.optional(),
  defaultFactoringCompanyId: z.number().nullable().optional(),
  billingEmail: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  notes: z.string().optional(),
  deactivatedAt: z.string().nullable().optional(),
  deactivatedBy: z.number().nullable().optional(),
  deactivationReason: z.string().nullable().optional(),
  reactivatedAt: z.string().nullable().optional(),
  reactivatedBy: z.number().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  portalAccessStatus: z.enum(['NO_ACCESS', 'INVITED', 'ACTIVE', 'DEACTIVATED']).optional(),
  pendingInvitationId: z.string().nullable().optional(),
  contacts: z.array(CustomerContactSchema).optional(),
  contactsCount: z.number().optional(),
});

export const CreateCustomerSchema = z.object({
  companyName: z.string().min(1),
  customerType: CustomerTypeSchema.optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  paymentTerms: PaymentTermsSchema.optional(),
  creditLimit: z.number().min(0).optional(),
  taxId: z.string().optional(),
  defaultBillingPath: BillingPathSchema.optional(),
  defaultFactoringCompanyId: z.number().nullable().optional(),
  billingEmail: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().length(2).optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().length(2).optional(),
  billingZip: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateCustomerSchema = z.object({
  companyName: z.string().min(1).optional(),
  customerType: CustomerTypeSchema.optional(),
  status: CustomerStatusSchema.optional(),
  mcNumber: z.string().optional(),
  dotNumber: z.string().optional(),
  paymentTerms: PaymentTermsSchema.or(z.literal('')).optional(),
  creditLimit: z.number().min(0).nullable().optional(),
  taxId: z.string().optional(),
  defaultBillingPath: BillingPathSchema.optional(),
  defaultFactoringCompanyId: z.number().nullable().optional(),
  billingEmail: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  billingAddress: z.string().optional(),
  billingCity: z.string().optional(),
  billingState: z.string().optional(),
  billingZip: z.string().optional(),
  notes: z.string().optional(),
});

export const CreateContactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  role: ContactRoleSchema,
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const UpdateContactSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: ContactRoleSchema.optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  notes: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

export const CustomerInviteSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

export const CustomerInviteResponseSchema = z.object({
  invitationId: z.string(),
  email: z.string(),
  status: z.string(),
  customerId: z.string(),
  expiresAt: z.string(),
  inviteLink: z.string().optional(),
});

// `CustomerType`, `CustomerStatus`, `PaymentTerms`, `ContactRole` types come
// from the codegen mirror via the re-export at the top of this file.
export type CustomerContact = z.infer<typeof CustomerContactSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type CreateCustomer = z.infer<typeof CreateCustomerSchema>;
export type UpdateCustomer = z.infer<typeof UpdateCustomerSchema>;
export type CreateContact = z.infer<typeof CreateContactSchema>;
export type UpdateContact = z.infer<typeof UpdateContactSchema>;
export type CustomerInvite = z.infer<typeof CustomerInviteSchema>;
export type CustomerInviteResponse = z.infer<typeof CustomerInviteResponseSchema>;

// Customer portal load types

export const CustomerLoadSchema = z.object({
  loadId: z.string(),
  loadNumber: z.string(),
  referenceNumber: z.string().nullable(),
  status: z.string(),
  customerName: z.string(),
  estimatedDelivery: z.string().optional(),
  originCity: z.string().optional(),
  originState: z.string().optional(),
  destinationCity: z.string().optional(),
  destinationState: z.string().optional(),
  createdAt: z.string(),
});

export const CustomerLoadStopSchema = z.object({
  id: z.number(),
  stopId: z.string(),
  sequenceOrder: z.number(),
  actionType: z.enum(['pickup', 'delivery']),
  appointmentDate: z.string().nullable(),
  earliestArrival: z.string().nullable(),
  latestArrival: z.string().nullable(),
  estimatedDockHours: z.number().nullable(),
  status: LoadStopStatusSchema,
  arrivedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  stopName: z.string().nullable(),
  stopCity: z.string().nullable(),
  stopState: z.string().nullable(),
  stopAddress: z.string().nullable(),
});

export const CustomerLoadDetailSchema = z.object({
  loadId: z.string(),
  loadNumber: z.string(),
  status: z.string(),
  customerName: z.string(),
  weightLbs: z.number().nullable(),
  commodityType: z.string().nullable(),
  requiredEquipmentType: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  pickupDate: z.string().nullable(),
  deliveryDate: z.string().nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  estimatedMiles: z.number().nullable(),
  assignedAt: z.string().nullable(),
  inTransitAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  stops: z.array(CustomerLoadStopSchema),
});

export type CustomerLoad = z.infer<typeof CustomerLoadSchema>;
export type CustomerLoadStop = z.infer<typeof CustomerLoadStopSchema>;
export type CustomerLoadDetail = z.infer<typeof CustomerLoadDetailSchema>;
