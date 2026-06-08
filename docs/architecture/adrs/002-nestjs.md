---
title: "ADR-002: NestJS 11 Backend"
description: Decision to use NestJS as the backend framework with Prisma ORM.
---

# ADR-002: NestJS 11 Backend

**Date:** 2025-06-01
**Status:** Accepted

## Context

SALLY's backend requires a structured framework capable of supporting a large domain model (fleet management, financials, compliance, AI), multi-tenant isolation, role-based access control, job queues, scheduled tasks, and auto-generated API documentation. The team needed a framework that enforces architectural conventions as the codebase scales.

## Decision

We chose **NestJS 11** as the backend framework with the following stack:

- **Prisma 7.3** as the ORM, connecting to PostgreSQL 16 (with pgvector for AI embeddings). Prisma is used directly in services — there is no separate repository abstraction layer.
- **BullMQ** for asynchronous job queues (document processing, sync operations, notifications).
- **@nestjs/schedule** for cron-based recurring tasks.
- **Swagger/OpenAPI** auto-generated from decorators for API documentation.
- **Global guard chain** executing in declaration order: ThrottlerGuard, JwtAuthGuard, TenantGuard, RolesGuard, PlanGuard.

**Alternatives considered:**

- **Plain Express:** Rejected — no built-in dependency injection, module system, or guard pipeline. Would require assembling these from scratch.
- **Fastify (standalone):** Rejected — faster raw throughput but lacks NestJS's opinionated module structure. NestJS can use Fastify as an adapter if needed.
- **Hapi:** Rejected — smaller ecosystem and community compared to NestJS.

## Consequences

**Positive:**

- Dependency injection and module system enforce consistent structure across 10+ domains.
- Decorators (`@Roles`, `@Throttle`, `@Public`) make cross-cutting concerns declarative.
- Guard pipeline handles auth, tenancy, roles, and plan enforcement without per-route boilerplate.
- Prisma's type-safe queries eliminate an entire class of runtime errors.
- Swagger generation keeps API docs in sync with code automatically.

**Negative:**

- NestJS has a learning curve for developers unfamiliar with Angular-style DI and decorators.
- Prisma's query API, while type-safe, can produce inefficient queries for complex joins — raw SQL is occasionally necessary.
- The global guard chain means every request pays the cost of all five guards, even when some are not relevant.
- BullMQ adds Redis as a required infrastructure dependency.
