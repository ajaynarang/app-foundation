import type { UserProfileDto } from './dto/login.dto';

/**
 * The profile the auth routes return. `user.tenant` and `user.role` are the session's workspace and role, which a
 * caller substitutes when they differ from the user's login default (refresh does).
 */
export function toUserProfile(user: any): UserProfileDto {
  return {
    dbId: user.id,
    userId: user.userId,
    email: user.email,
    emailVerified: user.emailVerified,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: user.tenant?.tenantId,
    tenantName: user.tenant?.companyName,
    tenantTimezone: user.tenant?.timezone ?? undefined,
    subdomain: user.tenant?.subdomain ?? undefined,
    isActive: user.isActive,
    phone: user.phone,
    phoneVerified: user.phoneVerified,
    hasPinSet: !!user.pinHash,
    createdAt: user.createdAt?.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString(),
  };
}
