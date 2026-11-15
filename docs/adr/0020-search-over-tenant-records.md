# ADR-0020 — Search over tenant records: a derived index beside the knowledge base, filled through a subject registry

**Date:** 2026-11-15 · **Status:** Adopted.

## Context

The starter could search one thing by meaning: the global knowledge base (`knowledge_documents`), which holds the
product's own help pages and has no tenant column. A tenant's own records (orders, tickets, policies) could not be
found by the assistant or by a workflow that needs context before it acts. `GET /search` is an entity lookup for the
command palette and returns nothing until a product registers providers.

One product built from this starter (Throughline) grew its own index: a `search_chunks` table refreshed from domain
events, with a hand-written loader and a database enum value per kind of record. It works, and it cannot be shared:
the kinds are compiled into the table and the listener.

Constraints: the foundation stays domain-free; search stays in Postgres (ADR-0011); embeddings go through the route
resolver on the tenant's own route (ADR-0005); a tenant with no embedding route must still be able to search.

## Decision

- **A second index, beside the knowledge base, not a replacement for it.** The knowledge base is global, curated
  content with audiences and an evaluation set. Tenant records are tenant-scoped, change constantly and are derived.
  They keep separate tables and share the mechanics: the Markdown chunker and Reciprocal Rank Fusion.
- **`search_chunks` is derived data.** One row per chunk of a record: tenant, subject type, the record's public id,
  title, optional `href`, section, content, a generated `tsvector`, and a `vector(1536)` that may be null. Nothing
  reads it as truth and nothing edits it by hand. `pnpm search:rebuild` writes it again from the records and removes
  what is gone. Held by `search-index.integration.spec.ts` on a real Postgres.
- **A product says what is searchable through a subject registry.** A `SearchSubject` names its type (a string, so
  a new kind needs no migration), the domain events that change it, how to read one record as text, and how to list
  them all. Subjects are Nest providers returned from `platform-glue/search/search-subjects.module.ts`, a seam file.
  The starter registers none: the table stays empty and no event is acted on. A type the column cannot hold, or one
  registered twice, fails at boot.
- **The index follows the records through their events.** One listener turns each event a subject listens for into
  one `search-index` job per record on the `ai-background` queue, which now has its real dispatcher (the placeholder
  processor is gone). The job re-reads the record and replaces its rows in one transaction, so a retry is safe. A
  record its subject answers `null` for leaves the index. An enqueue that fails is logged and never fails the flow
  that raised the event; the rebuild repairs it.
- **Embedding never blocks indexing or search.** Chunks are embedded as `document` on the tenant's route. When that
  fails (no route, zero retention, a provider refusal) the chunks are stored without vectors and full-text finds
  them; a later run fills the vectors in. A query that cannot be embedded is answered from full-text alone.
- **One way to read it: `SearchQueryService.retrieve(tenantId, query, options)`.** Two ranked lists, vector and
  any-term full-text, fused by rank; at most two chunks of one record. Code calls it directly (a workflow gathering
  context); the assistant reaches the same function through the `search-records` tool (scope `platform:read`), which
  takes the tenant from the server, never from the model. Every statement is scoped to the tenant with positional
  parameters. Held by `search-domain.spec.ts`.
- **It lives in the AI domain** (`apps/backend/src/domains/ai/search-index/`), beside the knowledge base it shares
  code with. A domain of its own would need an arrow to the AI domain for embeddings and one back for the tool,
  which `domain-boundaries.spec.ts` refuses.

## Consequences

- A product makes a kind of record searchable with one class and one line in the seam file, then runs
  `pnpm search:rebuild` once. The assistant and its workflows find it from then on.
- The assistant gains a tool in every product. With no subject registered it answers an empty list.
- Tenant embeddings cost money and land in the tenant's AI ledger like any other call, including a rebuild's.
- Access is tenant-wide. A subject must answer `null` for anything not every member of the workspace may read;
  per-user or per-team filtering is not built.
- The ranking drops Throughline's fixed 70/30 score blend for rank fusion; its ordering changes slightly when it
  adopts this.
- Left out on purpose: indexing the knowledge base into the same table, a `GET /search` provider over the index,
  citations for record hits, and re-ranking. Each can be added without changing the table.
