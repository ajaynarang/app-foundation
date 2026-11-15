-- The search index over tenant records (domains/ai/search-index). Derived data: `pnpm search:rebuild` writes it again.

-- CreateTable
CREATE TABLE "search_chunks" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "subject_type" VARCHAR(50) NOT NULL,
    "subject_id" VARCHAR(100) NOT NULL,
    "chunk_ix" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "href" VARCHAR(500),
    "section" VARCHAR(255),
    "content" TEXT NOT NULL,
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', "content")) STORED,
    "embedding_model" VARCHAR(100),
    "embedding" vector(1536),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_chunks_tenant_id_subject_type_idx" ON "search_chunks"("tenant_id", "subject_type");

-- CreateIndex
CREATE UNIQUE INDEX "search_chunks_tenant_id_subject_type_subject_id_chunk_ix_key" ON "search_chunks"("tenant_id", "subject_type", "subject_id", "chunk_ix");

-- AddForeignKey
ALTER TABLE "search_chunks" ADD CONSTRAINT "search_chunks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma cannot describe these two: a vector index for nearest-neighbour search and a GIN index for full-text.
CREATE INDEX "search_chunks_embedding_hnsw_idx" ON "search_chunks" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "search_chunks_content_tsv_idx" ON "search_chunks" USING gin ("content_tsv");
