-- Incremental knowledge-base ingest: the source file each chunk came from, the hash of what shaped its chunks (so
-- an unchanged file is never re-embedded), and the heading path the chunk sits under. Additive and nullable.
ALTER TABLE "knowledge_documents" ADD COLUMN "source_path" VARCHAR(255);
ALTER TABLE "knowledge_documents" ADD COLUMN "content_hash" CHAR(64);
ALTER TABLE "knowledge_documents" ADD COLUMN "section" VARCHAR(255);

CREATE INDEX "knowledge_documents_source_path_idx" ON "knowledge_documents"("source_path");

-- Every row that exists today was written by the old ingester, which deleted and rewrote the whole table on each
-- run. Mark them as the ingester's, grouped by the document they belong to, so retrieval's two-chunks-per-source cap
-- holds before the first sync, and the first normal `pnpm seed:knowledge` replaces them (no --force needed). Their
-- content_hash stays null, which never matches a file's hash.
UPDATE "knowledge_documents"
   SET "source_path" = 'legacy:' || COALESCE("parent_doc_id", "document_id")
 WHERE "source_path" IS NULL;
