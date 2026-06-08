import { z } from 'zod';

export const LoginSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().min(1),
});

export const UserLookupSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const UserProfileSchema = z.object({
  userId: z.string(),
  email: z.string(),
  emailVerified: z.boolean().optional(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'SUPER_ADMIN']),
  tenantId: z.string(),
  tenantName: z.string(),
  tenantTimezone: z.string().optional(),
  subdomain: z.string().optional(),
  isActive: z.boolean(),
  phone: z.string().optional(),
  phoneVerified: z.boolean().optional(),
  hasPinSet: z.boolean().optional(),
  createdAt: z.string().optional(),
  lastLoginAt: z.string().optional(),
});

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  user: UserProfileSchema,
});

export const TenantSchema = z.object({
  tenantId: z.string(),
  companyName: z.string(),
  subdomain: z.string().optional(),
  isActive: z.boolean(),
});

export const UserSummarySchema = z.object({
  userId: z.string(),
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.string(),
});

export const UserLookupResultSchema = UserSummarySchema.extend({
  tenantId: z.string(),
  tenantName: z.string(),
});

export const UserLookupResponseSchema = z.object({
  users: z.array(UserLookupResultSchema),
  multiTenant: z.boolean(),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
});

export const SendOtpSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
});

export const VerifyOtpSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  code: z.string().min(4).max(8),
});

export const SetPinSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
});

export const PhoneLoginSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  pin: z.string().regex(/^\d{4}$/),
});

export const FirebaseExchangeSchema = z.object({
  firebaseToken: z.string().min(1),
});

// Inferred types
export type LoginInput = z.infer<typeof LoginSchema>;
export type UserLookupInput = z.infer<typeof UserLookupSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;
export type UserLookupResult = z.infer<typeof UserLookupResultSchema>;
export type UserLookupResponse = z.infer<typeof UserLookupResponseSchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type SetPinInput = z.infer<typeof SetPinSchema>;
export type PhoneLoginInput = z.infer<typeof PhoneLoginSchema>;
export type FirebaseExchangeInput = z.infer<typeof FirebaseExchangeSchema>;
export type User = Pick<UserProfile, 'userId' | 'email' | 'firstName' | 'lastName' | 'role'>;
