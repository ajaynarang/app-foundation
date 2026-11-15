---
title: Writing knowledge-base content
documentType: reference
audience: all
category: getting-started
keywords:
  - knowledge base
  - markdown
  - frontmatter
  - seed:knowledge
---

# Writing knowledge-base content

The assistant's knowledge base is built from Markdown files in `apps/backend/content/knowledge-base/`.

## Frontmatter

Each file starts with frontmatter naming its `title`, `documentType` (faq, feature, use_case, comparison, pricing,
guide or reference), `audience`, `category` and optional `keywords`. The audience is `all` unless the product maps a
role to an audience of its own; a file tagged with an audience nobody reads is refused at ingest.

## Headings shape the chunks

Content is split at `##` and `###` headings, so one chunk never mixes two topics. Each chunk is stored with its title
and heading path in front ("Members and roles › Inviting teammates"), which gives a short chunk the context it needs.
Write one topic per heading and keep the heading descriptive.

## Syncing

Run `pnpm seed:knowledge` after editing content. Only changed files are re-embedded; unchanged ones cost nothing.
Pass `--force` to re-embed everything. Without an embedding key the files are stored for keyword search only, and a
later run with the key adds their vectors.

## Measuring retrieval

`pnpm kb:eval` asks the questions in `content/kb-eval/golden.json` and reports recall and mean reciprocal rank.
Add a question for every topic you care about, with the file a reader would expect to answer it.
