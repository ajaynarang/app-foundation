# Upgrade note: the AI platform

For a product that was scaffolded from this starter **before** the AI platform work, and now pulls it.

This file lists every change to AI behaviour, the environment contract and the schema, in the order the changes
were made. Each section says what changed, who notices, and what to do. Pull the work as a whole, with one
exception: the migration that drops the `ai_reader` role (see "Deploy order for `ai_reader`" below).

## 1. Guardrails load for real

**What changed.** The local guardrails (prompt injection, secrets, PII, system-prompt leakage) never loaded. The
backend is compiled to CommonJS, which turned `await import('@presidio-dev/hai-guardrails')` into `require()` of an
ESM-only package. Every boot logged `Failed to initialize guardrails engines` and every check failed open. The
package is now loaded with a native `import()` (`apps/backend/src/shared/utils/esm-import.ts`), and a pnpm patch
(`patches/@presidio-dev__hai-guardrails@1.12.0.patch`) fixes two broken paths inside the package's own bundle (a
hardcoded build-machine `__dirname` for its worker pool, and a worker file name that does not exist).

**Who notices.** Chat users. Messages that look like a prompt injection or carry a secret are now blocked, and PII
is redacted, as the moderation pipeline always intended. Check your assistant's flows for false positives.

**What to do.**

- Keep `@presidio-dev/hai-guardrails` pinned to exactly `1.12.0` in `apps/backend/package.json`. The patch is
  keyed to that version; a different version installs unpatched.
- Keep the `pnpm.patchedDependencies` entry in the root `package.json` and the `patches/` folder.
- If your Dockerfiles differ from the starter's, copy `patches/` into the image before the frozen install
  (`pnpm install --frozen-lockfile`); that install fails without it.
- No environment variable and no schema change.

## 2. The AI RLS wrapper is gone; migration `drop_dead_ai_rls`

**What changed.** Every tool call from chat, MCP or Desk ran inside a transaction that set
`SET LOCAL ROLE ai_reader`. No tool used that transaction's client, so the role's row-level policies applied to
nothing, and each call held a second pooled connection. The wrapper (`apps/backend/src/domains/ai/rls/`) is
deleted. Tools are called directly; tenant isolation is, as before, each tool's own `_tenantId` filter.

Migration `20261112200000_drop_dead_ai_rls` drops the two policies (`tenant_isolation_conversation`,
`tenant_isolation_message`) and disables row-level security on `conversations` and `conversation_messages`, but
only on a table where no other policy is left. It does not drop the `ai_reader` role. Rows are untouched.

**Who notices.** Nobody on the wire. Tool calls use one connection instead of two.

**What to do.**

- If you added your own `ai_reader` grants or policies for your tool tables (the old migration invited it), they
  were never enforced either, because tools query through the table owner's connection. Remove them, or replace
  them with real row-level security that comes with its own tenant-context plumbing.
- If your tools import `AiPrismaService` or `RlsModule`, drop the import and run the query directly.
- Deploy normally. The migration is safe for tasks still on the old code: it only removes restrictions, and the
  role they switch to still exists.

## Deploy order for `ai_reader`

A later change in this project adds the migration `drop_ai_reader_role`, which revokes the role's grants and drops
it. Old tasks run `SET LOCAL ROLE ai_reader` on every tool call, so that migration must not run while any task on
the old code is still serving. Deploy every change before it (at least section 2 above) in every environment
first, and only then pull the change that drops the role. Pulled in one deploy, both migrations would run while old
tasks still switch to the role.
