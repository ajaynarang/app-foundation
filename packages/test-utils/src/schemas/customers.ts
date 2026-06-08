/**
 * API Contracts for Customer endpoints.
 *
 * Matches the actual backend `CustomersService.formatResponse` +
 * `formatResponseWithAccess` output. Do NOT rely on `@app/shared-types`
 * `CustomerSchema` directly — it types `email` as `z.string().optional()` but
 * the backend returns `null` for unset optional strings, which breaks strict
 * parsing. These schemas reflect reality.
 */
import { z } from 'zod';
import { dbId, stringId, isoDateString } from './helpers.js';

// ── Contact — matches CustomerContactsService.formatResponse ─────

export const ContactSchema = z.object({
  id: dbId,
  contactId: stringId,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string(),
  isPrimary: z.boolean(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string().optional(),
  createdAt: isoDateString.optional(),
  updatedAt: isoDateString.optional(),
});

// Embedded contact shape used inside customer formatResponseWithAccess
// (lacks createdAt/updatedAt).
const EmbeddedContactSchema = z.object({
  id: dbId,
  contactId: stringId,
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  role: z.string(),
  isPrimary: z.boolean(),
  title: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string().optional(),
});

// ── Base customer fields (formatResponse) ─────────────────────────

const CustomerBaseSchema = z.object({
  id: dbId,
  customerId: stringId,
  companyName: z.string(),
  customerType: z.string(),
  status: z.string(),
  mcNumber: z.string().nullable(),
  dotNumber: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  creditLimit: z.number().nullable(),
  taxId: z.string().nullable(),
  defaultBillingPath: z.string().nullable(),
  defaultFactoringCompanyId: z.number().nullable(),
  billingEmail: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  billingAddress: z.string().nullable(),
  billingCity: z.string().nullable(),
  billingState: z.string().nullable(),
  billingZip: z.string().nullable(),
  notes: z.string().nullable(),
  deactivatedAt: z.string().nullable(),
  deactivatedBy: z.union([z.string(), z.number()]).nullable(),
  deactivationReason: z.string().nullable(),
  reactivatedAt: z.string().nullable(),
  reactivatedBy: z.union([z.string(), z.number()]).nullable(),
  createdAt: isoDateString,
  updatedAt: isoDateString,
});

// ── POST /customers — Create response (formatResponse only) ───────

export const CreateCustomerResponseSchema = CustomerBaseSchema;

// ── PUT /customers/:id — Update response ──────────────────────────

export const UpdateCustomerResponseSchema = CustomerBaseSchema;

// ── Deactivate/Reactivate response (formatResponse) ───────────────

export const CustomerLifecycleResponseSchema = CustomerBaseSchema;

// ── GET /customers — List item (formatResponseWithAccess) ─────────

export const CustomerListItemSchema = CustomerBaseSchema.extend({
  portalAccessStatus: z.string(),
  pendingInvitationId: z.string().nullable(),
  contacts: z.array(EmbeddedContactSchema),
  contactsCount: z.number(),
});

// ── GET /customers/:id — Detail (same shape as list item) ─────────

export const CustomerDetailSchema = CustomerListItemSchema;

// ── POST /customers/:id/invite — response ─────────────────────────

export const CustomerInviteResponseSchema = z.object({
  invitationId: stringId,
  email: z.string(),
  status: z.string(),
  customerId: stringId,
  expiresAt: isoDateString,
  inviteLink: z.string().optional(),
});

// ── DELETE /customers/:id/contacts/:contact_id — response ─────────

export const DeleteContactResponseSchema = z.object({
  contactId: stringId,
  message: z.string(),
});
