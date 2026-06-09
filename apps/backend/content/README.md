# Content

Markdown content ingested into the AI knowledge base.

- `knowledge-base/` — product docs, FAQs, guides. Run `pnpm seed:knowledge` to
  chunk, embed (pgvector), and index these for retrieval-augmented AI answers.

Organize by audience/category as you like; each file supports `title`,
`audience`, and `category` frontmatter.
