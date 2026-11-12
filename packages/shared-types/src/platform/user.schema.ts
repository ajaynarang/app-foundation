import { z } from 'zod';
import { UserRoleSchema } from '../generated/prisma-enums';
import { TenantRecordSchema } from './tenant.schema';

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

export const UserListItemSchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable().optional(),
});

export const UserListResponseSchema = z.object({
  users: z.array(UserListItemSchema),
  total: z.number(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER']),
});

// Inferred types
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UserListItem = z.infer<typeof UserListItemSchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;

// ─── Wire shapes of the user routes (the published contract) ─────────

/** One row of `GET /users` as the service selects it: the public `userId`, never the Int key, and the tenant. */
export const UserListEntrySchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  tenant: z.object({ tenantId: z.string(), companyName: z.string() }).nullable(),
});
export type UserListEntry = z.infer<typeof UserListEntrySchema>;

/** `POST /users`, `PATCH /users/:user_id`: the saved user with its full tenant row. */
export const UserSavedSchema = z.object({
  userId: z.string(),
  email: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  role: UserRoleSchema,
  isActive: z.boolean(),
  tenant: TenantRecordSchema.nullable(),
});
export type UserSaved = z.infer<typeof UserSavedSchema>;

/** `GET /users/:user_id` and the activate / deactivate actions: the user as they are now. */
export const UserDetailSchema = UserSavedSchema.extend({
  emailVerified: z.boolean(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
});
export type UserDetail = z.infer<typeof UserDetailSchema>;
