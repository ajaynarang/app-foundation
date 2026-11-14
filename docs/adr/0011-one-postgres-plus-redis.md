# ADR-0011 — One Postgres (pgvector) plus Redis; no second store

**Date:** 2026-11-14 · **Status:** Adopted.

## Context

Each extra data store is one more thing to provision, back up, secure, monitor and keep consistent with the
others. A product on this starter is usually run by one person or a small team. Postgres with the `pgvector`
extension already covers relational data, JSON documents, full-text search and vector search; Redis covers what
must be fast and may be lost.

## Decision

**Product state lives in one Postgres database. Redis holds only what can be lost or rebuilt. Files live in object
storage. No other store is added without a new decision record.**

- **Postgres is the source of truth.** Every table is declared in `packages/appshore/db/prisma/schema/` and created by
  a Prisma migration. Locally it is the `pgvector/pgvector` image in `docker-compose.yml`; deployed it is RDS
  (`infra/terraform/rds.tf`).
  - Documents are `TEXT` or `JSONB` columns, not a document database.
  - Vector search uses `vector(...)` columns (the knowledge base's `KnowledgeDocument.embedding`), managed with raw
    SQL beside the Prisma model.
  - Full-text search uses `tsvector` columns (`KnowledgeDocument.contentTsv`).
  - Events and timers are rows too: the outbox and `Deadline` (ADR
    [Outbox and deadlines](0003-outbox-and-deadlines.md)).
- **Redis is a cache and a transport, never a record.** Locally the `redis` service in `docker-compose.yml`;
  deployed, ElastiCache (`infra/terraform/elasticache.tf`). It holds:
  - the BullMQ queues (work a tenant submits is also recorded as a `Job` row in Postgres, and a timer is a
    `Deadline` row, never a delayed job);
  - the app cache (`packages/appshore/platform/src/infrastructure/cache/`), rebuilt on a miss;
  - rate-limit counters (`redis-throttler.storage.ts`);
  - idempotency records, with a 24-hour expiry
    (`packages/appshore/platform/src/infrastructure/idempotency/idempotency.store.ts`);
  - vendor circuit-breaker state.

  Losing Redis loses in-flight work and warm caches, not data a user created. Review only.

- **Files go to S3** (`infra/terraform/s3.tf`; MinIO locally, in `docker-compose.yml`), referenced from a Postgres
  row.
- **The local observability services** (Loki, Tempo, Prometheus, Grafana in `docker-compose.yml`) hold telemetry for
  a developer's machine. They are not product state and are not deployed.

## Consequences

- One backup, one migration history, one place to enforce tenancy (ADR [Tenancy](0009-tenancy.md)).
- A feature that wants search, documents or embeddings starts in Postgres. A dedicated search engine or vector store
  is added only when Postgres is measured to fall short, in its own decision record, and Postgres stays the source
  of truth that the new store is rebuilt from.
- A queue, cache or counter must tolerate Redis being flushed: a job handler is idempotent, a cache read falls back
  to Postgres, and an idempotency key fails open (the request runs as it would without one).
