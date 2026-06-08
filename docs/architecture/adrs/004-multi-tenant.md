---
title: "ADR-004: Multi-Tenant Row-Level Isolation"
description: Decision to implement multi-tenancy via row-level isolation with tenantId foreign keys.
---

# ADR-004: Multi-Tenant Row-Level Isolation

**Date:** 2025-06-01
**Status:** Accepted

## Context

SALLY is a SaaS platform serving multiple trucking companies (tenants). Each tenant's data — drivers, vehicles, loads, invoices, settlements — must be strictly isolated. The isolation strategy affects database design, query patterns, deployment costs, and operational complexity.

## Decision

We chose **row-level isolation** with a `tenantId` foreign key on every major table.

Key design elements:

- **TenantGuard** (third in the global guard chain) extracts the tenant context from the authenticated JWT and injects it into the request. All downstream services use this context to scope queries.
- **Composite indexes** on `(tenant_id, ...)` ensure tenant-scoped queries perform well without full table scans.
- **Six roles** govern access within a tenant: DISPATCHER, DRIVER, ADMIN, OWNER, CUSTOMER, SUPER_ADMIN.
- **Tenant lifecycle:** PENDING_APPROVAL, ACTIVE, REJECTED, SUSPENDED.
- **Subscription plans:** TRIAL, TRIAL_EXPIRED, STARTER, PROFESSIONAL, ENTERPRISE, SUSPENDED. Plan enforcement is handled by PlanGuard (fifth in the guard chain).

**Alternatives considered:**

- **Schema-per-tenant:** Rejected — PostgreSQL schema proliferation complicates migrations, and Prisma does not natively support runtime schema switching.
- **Database-per-tenant:** Rejected — operational overhead of managing hundreds of database instances is prohibitive at our scale and team size.

## Consequences

**Positive:**

- Single database simplifies migrations, backups, and monitoring.
- Prisma queries work naturally — just add `where: { tenant_id }` to every query.
- New tenants are onboarded instantly without provisioning infrastructure.
- Cross-tenant analytics (for SUPER_ADMIN) are straightforward since all data is in one database.

**Negative:**

- Every query must include the tenant filter. A missed `tenant_id` in a `WHERE` clause is a data leak. This is mitigated by the TenantGuard but requires developer discipline in service code.
- A single noisy tenant can degrade performance for others without additional safeguards (connection pooling limits, query timeouts).
- Database-level isolation guarantees are weaker — a SQL injection or ORM bug could theoretically cross tenant boundaries.
- Schema migrations affect all tenants simultaneously; there is no per-tenant rollback.
