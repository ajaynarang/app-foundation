import { z } from 'zod';

export const InviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(['DISPATCHER', 'DRIVER', 'ADMIN', 'OWNER']),
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
  driverId: z.string().optional(),
  driverName: z.string().optional(),
});

export const UserListResponseSchema = z.object({
  users: z.array(UserListItemSchema),
  total: z.number(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['DISPATCHER', 'DRIVER', 'ADMIN', 'OWNER']),
});

// Inferred types
export type InviteUserInput = z.infer<typeof InviteUserSchema>;
export type UserListItem = z.infer<typeof UserListItemSchema>;
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleSchema>;
