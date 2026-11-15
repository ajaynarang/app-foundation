import { z } from 'zod';

/**
 * Error codes the identity routes answer, beside the cross-cutting `ApiErrorCode`s (a domain adds its own,
 * `api-error.ts`). The web imports these instead of copying strings. Every one travels in the usual envelope
 * (`statusCode`, `code`, `detail`).
 */
export const AuthErrorCode = {
  /** 401 — the account exists but signs in another way (Firebase, phone); the web may fall back to Firebase. */
  PASSWORD_NOT_SET: 'PASSWORD_NOT_SET',
  /** 400 — the verification link is unknown, used, expired, for an address the account no longer has, or another account's. */
  VERIFICATION_LINK_INVALID: 'VERIFICATION_LINK_INVALID',
  /** 403 — the action needs a verified email; the web offers to resend the verification email. */
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  /** 409 — an account already uses the invitation's email; sign in as it to accept. */
  SIGN_IN_TO_ACCEPT: 'SIGN_IN_TO_ACCEPT',
  /** 403 — the invitation is for a different email than the signed-in account's. */
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
} as const;
export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

export const LoginSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().min(1),
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
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type LoginResponse = z.infer<typeof LoginResponseSchema>;
export type Tenant = z.infer<typeof TenantSchema>;
export type UserSummary = z.infer<typeof UserSummarySchema>;
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;
export type SendOtpInput = z.infer<typeof SendOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type SetPinInput = z.infer<typeof SetPinSchema>;
export type PhoneLoginInput = z.infer<typeof PhoneLoginSchema>;
export type FirebaseExchangeInput = z.infer<typeof FirebaseExchangeSchema>;
export type User = Pick<UserProfile, 'userId' | 'email' | 'firstName' | 'lastName' | 'role'>;
