-- Clear the stored embedding vectors: the embedding model changes.
--
-- Vectors were written by OpenAI `text-embedding-3-small`. Embeddings now come from Cohere Embed v4 at the same
-- 1536 dimensions, through the per-tenant route resolver. Vectors from two models live in different spaces and
-- cannot be compared, so an old vector left searchable would match new queries at random.
--
-- Rows and their text are kept; only the vector column is set to NULL. Until they are re-embedded, knowledge-base
-- search answers from full-text and Desk memory recall scores without the semantic term. Neither errors.
--
-- Re-embed after deploying:
--   1. `pnpm --filter @app/backend seed:knowledge` (the ingester rewrites every knowledge-base row with a vector).
--   2. `pnpm --filter @app/backend ai:reembed-desk-memory` (Desk memory rows with no vector, tenant by tenant, on
--      each tenant's own route). Safe to re-run.
--
-- The dimension stays vector(1536); no index or column changes.
UPDATE "knowledge_documents" SET "embedding" = NULL WHERE "embedding" IS NOT NULL;
UPDATE "desk_memories" SET "content_embedding" = NULL WHERE "content_embedding" IS NOT NULL;
