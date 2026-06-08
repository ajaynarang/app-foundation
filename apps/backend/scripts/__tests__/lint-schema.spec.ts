import { lintSchema, type LintViolation } from '../lint-schema';

describe('lint-schema', () => {
  describe('rule: no-cuid', () => {
    it('flags @default(cuid()) on PK columns', () => {
      const schema = `
        model Foo {
          id String @id @default(cuid())
        }
      `;
      const violations = lintSchema(schema);
      expect(violations).toContainEqual<LintViolation>({
        rule: 'no-cuid',
        model: 'Foo',
        field: 'id',
        message: expect.stringContaining('CUID is banned'),
      });
    });

    it('flags @default(cuid()) on non-PK columns too', () => {
      const schema = `
        model Foo {
          id      Int    @id @default(autoincrement())
          tenantId Int
          publicId String @unique @default(cuid())
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'no-cuid' && v.field === 'publicId')).toBe(true);
    });
  });

  describe('rule: audit-needs-uuidv7', () => {
    it('flags @default(uuid()) on audit-named tables', () => {
      const schema = `
        model AuditLog {
          id String @id @default(uuid())
          tenantId Int
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'audit-needs-uuidv7' && v.model === 'AuditLog')).toBe(true);
    });

    it('flags @default(uuid()) on Episode-named tables', () => {
      const schema = `
        model DeskEpisode {
          id String @id @default(uuid())
          tenantId Int
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'audit-needs-uuidv7' && v.model === 'DeskEpisode')).toBe(true);
    });

    it('does NOT flag @default(uuid()) on operational tables (which is its own violation: should-be-int)', () => {
      const schema = `
        model SomeOperationalThing {
          id String @id @default(uuid())
          tenantId Int
        }
      `;
      const violations = lintSchema(schema);
      // audit-needs-uuidv7 only fires for audit-named tables
      expect(violations.find((v) => v.rule === 'audit-needs-uuidv7')).toBeUndefined();
    });
  });

  describe('rule: fk-must-target-id', () => {
    it('flags FKs that reference a non-id column', () => {
      const schema = `
        model TenantPlanEvent {
          id       String @id @default(cuid())
          tenantId Int
          tenant   Tenant @relation(fields: [tenantId], references: [tenantId])
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'fk-must-target-id' && v.model === 'TenantPlanEvent')).toBe(true);
    });

    it('does not flag FKs that reference id', () => {
      const schema = `
        model Load {
          id       Int  @id @default(autoincrement())
          tenantId Int
          tenant   Tenant @relation(fields: [tenantId], references: [id])
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'fk-must-target-id')).toBeUndefined();
    });
  });

  describe('rule: no-embedded-token', () => {
    it('flags token columns on operational entity rows', () => {
      const schema = `
        model Load {
          id            Int     @id @default(autoincrement())
          tenantId      Int
          trackingToken String? @unique @map("tracking_token")
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'no-embedded-token' && v.field === 'trackingToken')).toBe(true);
    });

    it('does NOT flag token columns on dedicated token tables', () => {
      const schema = `
        model LoadShareLink {
          id       Int    @id @default(autoincrement())
          tenantId Int
          token    String @unique
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'no-embedded-token')).toBeUndefined();
    });

    it('does NOT flag known OAuth/ApiKey tables', () => {
      const schema = `
        model OAuthAccessToken {
          id    String @id @default(uuid())
          token String @unique
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'no-embedded-token')).toBeUndefined();
    });
  });

  describe('rule: tenant-scoping-missing', () => {
    it('flags missing tenantId on tenant-scoped tables', () => {
      const schema = `
        model SomeOpEntity {
          id Int @id @default(autoincrement())
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'tenant-scoping-missing' && v.model === 'SomeOpEntity')).toBe(true);
    });

    it('does not flag tables with tenantId', () => {
      const schema = `
        model SomeOpEntity {
          id       Int @id @default(autoincrement())
          tenantId Int
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'tenant-scoping-missing')).toBeUndefined();
    });

    it('does not flag the Tenant model itself or known global tables', () => {
      const schema = `
        model Tenant {
          id Int @id @default(autoincrement())
        }
        model PlanConfig {
          id String @id
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'tenant-scoping-missing')).toBeUndefined();
    });
  });

  describe('rule: naming-camelcase', () => {
    it('flags snake_case Prisma field names', () => {
      const schema = `
        model Foo {
          id        Int @id @default(autoincrement())
          tenantId  Int
          tenant_id Int
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'naming-camelcase' && v.field === 'tenant_id')).toBe(true);
    });

    it('does not flag camelCase field names', () => {
      const schema = `
        model Foo {
          id        Int @id @default(autoincrement())
          tenantId  Int
          createdAt DateTime
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'naming-camelcase')).toBeUndefined();
    });
  });

  describe('rule: datetime-suffix', () => {
    it('flags datetime fields not ending in At/Date', () => {
      const schema = `
        model Foo {
          id       Int      @id @default(autoincrement())
          tenantId Int
          deliver  DateTime
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.rule === 'datetime-suffix' && v.field === 'deliver')).toBe(true);
    });

    it('accepts <verb>At for timestamps', () => {
      const schema = `
        model Foo {
          id          Int      @id @default(autoincrement())
          tenantId    Int
          createdAt   DateTime
          deliveredAt DateTime
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'datetime-suffix')).toBeUndefined();
    });

    it('accepts <noun>Date for calendar dates', () => {
      const schema = `
        model Foo {
          id        Int      @id @default(autoincrement())
          tenantId  Int
          issueDate DateTime @db.Date
          dueDate   DateTime @db.Date
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.find((v) => v.rule === 'datetime-suffix')).toBeUndefined();
    });
  });

  describe('allowlist', () => {
    it('respects allowlist for known existing violations (Model.field:rule)', () => {
      const schema = `
        model DeskEpisode {
          id String @id @default(uuid())
          tenantId Int
        }
      `;
      const violations = lintSchema(schema, { allowlist: ['DeskEpisode.id:audit-needs-uuidv7'] });
      expect(violations.find((v) => v.model === 'DeskEpisode' && v.rule === 'audit-needs-uuidv7')).toBeUndefined();
    });

    it('respects allowlist for model-level violations (Model:rule)', () => {
      const schema = `
        model Standalone {
          id Int @id @default(autoincrement())
        }
      `;
      const violations = lintSchema(schema, { allowlist: ['Standalone:tenant-scoping-missing'] });
      expect(violations.find((v) => v.model === 'Standalone' && v.rule === 'tenant-scoping-missing')).toBeUndefined();
    });

    it('does not silence non-allowlisted rules', () => {
      const schema = `
        model Foo {
          id        Int @id @default(autoincrement())
          tenantId  Int
          tenant_id Int
        }
      `;
      const violations = lintSchema(schema, { allowlist: ['Foo.tenant_id:no-cuid'] });
      // tenant_id is still flagged for naming-camelcase
      expect(violations.some((v) => v.rule === 'naming-camelcase')).toBe(true);
    });
  });

  describe('parsing', () => {
    it('handles multiple models in one schema', () => {
      const schema = `
        model A {
          id Int @id @default(autoincrement())
          tenantId Int
        }
        model B {
          id String @id @default(cuid())
          tenantId Int
        }
      `;
      const violations = lintSchema(schema);
      expect(violations.some((v) => v.model === 'B' && v.rule === 'no-cuid')).toBe(true);
      expect(violations.some((v) => v.model === 'A')).toBe(false);
    });

    it('ignores comment lines and block-level attributes (@@unique, @@index, @@map)', () => {
      const schema = `
        model Foo {
          // a comment
          id Int @id @default(autoincrement())
          tenantId Int
          @@unique([tenantId, id])
          @@index([tenantId])
          @@map("foos")
        }
      `;
      const violations = lintSchema(schema);
      expect(violations).toEqual([]);
    });

    it('does not crash on enum or empty blocks', () => {
      const schema = `
        enum LoadStatus {
          PENDING
          IN_TRANSIT
        }
        model Foo {
          id Int @id @default(autoincrement())
          tenantId Int
        }
      `;
      expect(() => lintSchema(schema)).not.toThrow();
    });
  });
});
