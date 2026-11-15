// Tenant-context conflicts throw in unit tests (and so in every CI run of them), never only log
// (docs/standards/observability.md; packages/appshore/kernel/src/infrastructure/rls/rls-context.ts).
process.env.RLS_STRICT_CONTEXT = process.env.RLS_STRICT_CONTEXT || 'throw';
