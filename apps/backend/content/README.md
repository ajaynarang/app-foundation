# SALLY Knowledge Base & Product Manual

## Directory Structure

```
content/
├── knowledge-base/    # Prospect-facing sales/product docs (audience: prospect)
│   ├── faq/           # 22 FAQ documents
│   ├── features/      # 19 feature descriptions
│   ├── pricing/       # 1 pricing document
│   └── use-cases/     # 4 use case documents
│
└── product-manual/    # Authenticated user guides (audience: all)
    ├── getting-started/   # 4 onboarding docs
    ├── web-app/           # 21 docs (dispatcher, driver, admin, customer)
    ├── console-app/       # 14 docs (config, integrations, developer, team)
    ├── sally-ai/          # 5 docs
    └── reference/         # 4 docs (roles, shortcuts, troubleshooting, glossary)
```

## How It Works

1. **Content authored here** as markdown with YAML frontmatter
2. **RAG ingestion** chunks, embeds (OpenAI text-embedding-3-small), and stores in PostgreSQL pgvector
3. **Sally AI** searches via hybrid search (0.7 vector + 0.3 full-text) to answer questions
4. **Console docs** generated from these files at build time via `apps/console/scripts/sync-product-manual.js`

## Frontmatter Format

```yaml
---
title: "Document Title"
documentType: faq | feature | use_case | comparison | pricing | guide | reference
audience: prospect | dispatcher | driver | all
category: general | pricing | route_planning | dispatcher | console | sally_ai | reference | ...
keywords: [relevant, keywords, here]
---
```

- `documentType`: `faq`, `feature`, `use_case`, `comparison`, `pricing` for prospect KB; `guide`, `reference` for product manual
- `audience`: `prospect` for sales docs, `all` for product manual (accessible to all authenticated users)
- `category`: used by `get-product-info` tool for structured retrieval

## Vectorization / Ingestion

Run ingestion to embed all content into pgvector:

```bash
# Ensure PostgreSQL is running with pgvector extension
docker-compose up -d

# Run ingestion (from apps/backend/)
cd apps/backend
pnpm run seed:knowledge
```

This uses a lightweight `IngestionModule` (not the full AppModule) defined in `src/domains/ai/knowledge-base/ingestion.command.ts`. It loads all markdown files from both content directories, chunks them, embeds via OpenAI, and stores in `knowledge_documents` table.

**Ingestion is wipe-and-replace** — it deletes all existing `KnowledgeDocument` rows and re-inserts. Safe to run repeatedly.

## When to Re-Ingest

Re-run ingestion after ANY content change:
- Editing existing docs
- Adding new docs
- Removing docs
- Changing frontmatter (title, category, keywords)

**Content changes are NOT live until ingestion runs.** The markdown files are the source of truth, but Sally AI reads from pgvector, not the filesystem.

## Console Docs Sync

Product manual docs are also served as browsable pages in the Console app:

```bash
# Generate MDX pages from markdown (from apps/console/)
cd apps/console
node scripts/sync-product-manual.js

# Or it runs automatically during build
pnpm build  # prebuild hook runs sync
```

**Sync is automatic during `pnpm build`** but must be run manually during development if you want to preview changes.

## Maintenance Checklist

### Adding a New Document

1. Create `.md` file in the appropriate directory with valid frontmatter
2. If it's a product manual doc and introduces a new `category`, add the category to:
   - `knowledge.tool.ts` → `get-product-info` topic enum
3. Run ingestion to vectorize
4. If product manual: add sidebar entry in `apps/console/src/components/docs-sidebar.tsx`
5. Run Console sync: `cd apps/console && node scripts/sync-product-manual.js`

### Updating Pricing

The `get-pricing` MCP tool reads directly from the `PlanConfig` and `PlanEntitlement` database tables — no hardcoded values. Update pricing in TWO places:

| Source | Location | Purpose |
|--------|----------|---------|
| Database seed | `prisma/seeds/07-plan-config.seed.ts` | Source of truth (DB) |
| Knowledge base | `content/knowledge-base/pricing/pricing-tiers.md` | Sally AI RAG answers |

**Always update the seed first** (and run it), then update the KB doc and re-ingest. The `get-pricing` tool will automatically reflect DB changes.

### Updating Feature Entitlements

Entitlements live in `prisma/seeds/08-plan-entitlements.seed.ts`. When entitlements change, update:
- Relevant KB docs that reference plan-gated features
- Relevant product manual docs with plan callouts
- Re-run ingestion

### Content Validation

The content loader validates frontmatter at ingestion time:
- Missing `title`, `documentType`, `audience`, or `category` → throws error
- Invalid `documentType` or `audience` value → throws error
- This prevents silent data corruption from typos in frontmatter
