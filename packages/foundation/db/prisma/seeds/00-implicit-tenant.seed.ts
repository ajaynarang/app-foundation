import { PrismaClient } from '../../generated/client';

/**
 * Implicit tenant bootstrap — single-tenant mode only.
 *
 * When MULTI_TENANT=false the app runs as a single workspace: there is no
 * tenant self-registration, and every tenant-scoped query resolves to one
 * implicit tenant row. This seed guarantees that row exists (id =
 * IMPLICIT_TENANT_ID, default 1) plus a default OWNER admin attached to it.
 *
 * In multi-tenant mode this seed is a no-op (tenants are created via the
 * registration/onboarding flow instead).
 */

const MULTI_TENANT = process.env.MULTI_TENANT !== 'false';
const IMPLICIT_TENANT_ID = parseInt(process.env.IMPLICIT_TENANT_ID || '1', 10);
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'owner@example.com';

export const seed = {
  name: 'Implicit Tenant (single-tenant mode)',
  description: 'Seeds the one implicit tenant + default owner when MULTI_TENANT=false',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    if (MULTI_TENANT) {
      // Multi-tenant: tenants come from registration; nothing to bootstrap.
      return { created: 0, skipped: 1 };
    }

    const existing = await prisma.tenant.findUnique({ where: { id: IMPLICIT_TENANT_ID } });
    if (existing) {
      return { created: 0, skipped: 1 };
    }

    // Force the surrogate id so tenant-scoped queries (where: { tenantId: IMPLICIT_TENANT_ID })
    // resolve to this row. Raw insert lets us pin the autoincrement id deterministically.
    await prisma.$executeRawUnsafe(
      `INSERT INTO "tenants" ("id", "tenant_id", "company_name", "status", "is_active", "plan", "timezone", "created_at", "updated_at")
       VALUES ($1, $2, $3, 'ACTIVE', true, 'ENTERPRISE', 'UTC', now(), now())
       ON CONFLICT ("id") DO NOTHING`,
      IMPLICIT_TENANT_ID,
      'default',
      'Default Workspace',
    );

    // Keep the sequence ahead of the pinned id so future inserts don't collide.
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"tenants"', 'id'), GREATEST((SELECT MAX("id") FROM "tenants"), $1))`,
      IMPLICIT_TENANT_ID,
    );

    // Default workspace owner (distinct from the platform SUPER_ADMIN).
    const existingOwner = await prisma.user.findFirst({
      where: { tenantId: IMPLICIT_TENANT_ID, role: 'OWNER' },
    });
    if (!existingOwner) {
      const owner = await prisma.user.create({
        data: {
          userId: 'user_default_owner_001',
          email: DEFAULT_ADMIN_EMAIL,
          firstName: 'Workspace',
          lastName: 'Owner',
          role: 'OWNER',
          tenantId: IMPLICIT_TENANT_ID,
          isActive: true,
          emailVerified: true,
        },
      });
      await prisma.userPreferences.create({ data: { userId: owner.id } });
    }

    return { created: 1, skipped: 0 };
  },
};
