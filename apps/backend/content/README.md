# Content

Markdown content ingested into the AI knowledge base.

- `knowledge-base/` — product docs, FAQs, guides. Run `pnpm seed:knowledge` to chunk, embed (pgvector) and index
  them for retrieval-augmented answers. The sync is incremental: only files whose content changed are re-embedded,
  and `--force` re-embeds everything. Without `COHERE_API_KEY` the files are stored for full-text search only.
- `kb-eval/golden.json` — questions with the files a reader would expect to answer them. `pnpm kb:eval` scores
  retrieval against it (recall at 5, mean reciprocal rank). Replace the starter questions with your own.

Each file needs `title`, `documentType`, `audience` and `category` frontmatter, and may list `keywords`. The audience
is `all`. Role audiences (`src/domains/ai/knowledge-base/kb-audience.ts`) wait until the tool runner injects the
caller's role; see the note in that file. Content is
split at `##` and `###` headings, so write one topic per heading. `knowledge-base/getting-started/` explains the rest.
