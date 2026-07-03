import { PrismaClient } from '../../generated/client';
import { DEV_OWNER_PHONE, devCredentialColumns } from './dev-credentials';

/**
 * First tenant bootstrap — both tenancy modes.
 *
 * Single-tenant (MULTI_TENANT=false): guarantees the one implicit tenant row
 * exists (id = IMPLICIT_TENANT_ID, default 1, slug "default") — every
 * tenant-scoped query resolves to it.
 *
 * Multi-tenant (default): seeds a ready-to-use ACTIVE demo tenant
 * (slug "demo") so a fresh clone has a workspace to log into immediately.
 * Further tenants come from self-registration + super-admin approval.
 *
 * Both modes create a workspace OWNER (owner@example.com). Outside
 * production the owner gets dev credentials (see dev-credentials.ts) so
 * login works with zero external services.
 */

const MULTI_TENANT = process.env.MULTI_TENANT !== 'false';
const IMPLICIT_TENANT_ID = parseInt(process.env.IMPLICIT_TENANT_ID || '1', 10);
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'owner@example.com';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;

export const seed = {
  name: 'First Tenant + Owner',
  description: 'Implicit tenant (single-tenant) or demo tenant (multi-tenant) + workspace owner with dev credentials',

  async run(prisma: PrismaClient): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let tenantDbId: number;

    if (MULTI_TENANT) {
      const existing = await prisma.tenant.findFirst({ where: { subdomain: 'demo' } });
      if (existing) {
        tenantDbId = existing.id;
      } else {
        const tenant = await prisma.tenant.create({
          data: {
            tenantId: 'demo',
            companyName: 'Demo Workspace',
            subdomain: 'demo',
            status: 'ACTIVE',
            isActive: true,
            plan: 'ENTERPRISE',
            timezone: 'UTC',
          },
        });
        tenantDbId = tenant.id;
        created++;
      }
    } else {
      const existing = await prisma.tenant.findUnique({ where: { id: IMPLICIT_TENANT_ID } });
      if (existing) {
        tenantDbId = existing.id;
      } else {
        // Force the surrogate id so tenant-scoped queries (where: { tenantId:
        // IMPLICIT_TENANT_ID }) resolve to this row. Raw insert pins the
        // autoincrement id deterministically.
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
        tenantDbId = IMPLICIT_TENANT_ID;
        created++;
      }
    }

    // Workspace owner (distinct from the platform SUPER_ADMIN).
    const existingOwner = await prisma.user.findFirst({
      where: { tenantId: tenantDbId, role: 'OWNER' },
    });
    if (existingOwner && !existingOwner.passwordHash) {
      // Older seed data — attach the dev credentials so login works.
      const credentials = await devCredentialColumns(DEFAULT_ADMIN_PASSWORD, DEV_OWNER_PHONE);
      if (Object.keys(credentials).length > 0) {
        await prisma.user.update({ where: { id: existingOwner.id }, data: credentials });
        created++;
      }
    }
    if (!existingOwner) {
      const credentials = await devCredentialColumns(DEFAULT_ADMIN_PASSWORD, DEV_OWNER_PHONE);
      const owner = await prisma.user.create({
        data: {
          userId: MULTI_TENANT ? 'user_demo_owner_001' : 'user_default_owner_001',
          email: DEFAULT_ADMIN_EMAIL,
          firstName: 'Workspace',
          lastName: 'Owner',
          role: 'OWNER',
          tenantId: tenantDbId,
          isActive: true,
          emailVerified: true,
          ...credentials,
        },
      });
      await prisma.userPreferences.create({ data: { userId: owner.id } });
      created++;
    }

    // A teammate for each remaining role — lets you try role-based UI (and
    // run the RBAC QA suite) on a fresh clone. Same dev credentials.
    const teammates: Array<{
      role: 'ADMIN' | 'MEMBER';
      email: string;
      userId: string;
      phone: string;
      firstName: string;
    }> = [
      {
        role: 'ADMIN',
        email: 'admin-user@example.com',
        userId: 'user_demo_admin_001',
        phone: '+15555550101',
        firstName: 'Admin',
      },
      {
        role: 'MEMBER',
        email: 'member@example.com',
        userId: 'user_demo_member_001',
        phone: '+15555550102',
        firstName: 'Member',
      },
    ];
    for (const t of teammates) {
      const existing = await prisma.user.findFirst({ where: { tenantId: tenantDbId, role: t.role } });
      if (existing) continue;
      const credentials = await devCredentialColumns(DEFAULT_ADMIN_PASSWORD, t.phone);
      const user = await prisma.user.create({
        data: {
          userId: t.userId,
          email: t.email,
          firstName: t.firstName,
          lastName: 'User',
          role: t.role,
          tenantId: tenantDbId,
          isActive: true,
          emailVerified: true,
          ...credentials,
        },
      });
      await prisma.userPreferences.create({ data: { userId: user.id } });
      created++;
    }

    // Workspace memberships — source of truth for the workspace-based model.
    const tenantUsers = await prisma.user.findMany({ where: { tenantId: tenantDbId } });
    for (const u of tenantUsers) {
      await prisma.workspaceMember.upsert({
        where: { userId_tenantId: { userId: u.id, tenantId: tenantDbId } },
        update: {},
        create: { userId: u.id, tenantId: tenantDbId, role: u.role, isDefault: true },
      });
    }

    // Multi-tenant demo: a second workspace with the owner as ADMIN, so the
    // workspace switcher is demonstrable on a fresh clone.
    if (MULTI_TENANT) {
      let second = await prisma.tenant.findFirst({ where: { subdomain: 'demo-two' } });
      if (!second) {
        second = await prisma.tenant.create({
          data: {
            tenantId: 'demo-two',
            companyName: 'Second Workspace',
            subdomain: 'demo-two',
            status: 'ACTIVE',
            isActive: true,
            plan: 'ENTERPRISE',
            timezone: 'UTC',
          },
        });
        created++;
      }
      const owner = await prisma.user.findFirst({ where: { tenantId: tenantDbId, role: 'OWNER' } });
      if (owner) {
        await prisma.workspaceMember.upsert({
          where: { userId_tenantId: { userId: owner.id, tenantId: second.id } },
          update: {},
          create: { userId: owner.id, tenantId: second.id, role: 'ADMIN', isDefault: false },
        });
      }
    }

    return { created, skipped: created === 0 ? 1 : 0 };
  },
};
