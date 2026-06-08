/**
 * User roles — single source of truth for frontend role checks and display logic.
 *
 * NOTE: Backend @Roles() decorators should use the Prisma `UserRole` enum
 * from `@prisma/client` for compile-time safety. This object is for contexts
 * where the Prisma enum is not available (frontend, shared-types).
 */
export const USER_ROLES = {
  DISPATCHER: 'DISPATCHER',
  DRIVER: 'DRIVER',
  ADMIN: 'ADMIN',
  OWNER: 'OWNER',
  CUSTOMER: 'CUSTOMER',
  SUPER_ADMIN: 'SUPER_ADMIN',
} as const;

/** String union of all role values. Prefer Prisma `UserRole` enum on the backend. */
export type UserRoleValue = (typeof USER_ROLES)[keyof typeof USER_ROLES];

/** Roles with fleet management access (dispatch, drivers, loads, vehicles) */
export const FLEET_MANAGEMENT_ROLES = [USER_ROLES.OWNER, USER_ROLES.ADMIN, USER_ROLES.DISPATCHER] as const;

/**
 * Roles that receive operational notifications.
 * Same as FLEET_MANAGEMENT_ROLES today — separated because notification
 * recipients may include CUSTOMER in the future.
 */
export const NOTIFICATION_RECIPIENT_ROLES = [USER_ROLES.OWNER, USER_ROLES.ADMIN, USER_ROLES.DISPATCHER] as const;
