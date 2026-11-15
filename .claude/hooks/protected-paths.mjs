#!/usr/bin/env node
/**
 * Claude Code hook: protected paths (PreToolUse on Edit|MultiEdit|Write). Blocks the edit (exit 2, the reason on
 * stderr) when the file is:
 *
 *   - generated: the Prisma client, the shared enum mirror, the committed OpenAPI documents, the Grafana-as-code
 *     output. Change the source and regenerate instead.
 *   - a real env file (`.env`, `.env.local`, `.env.production`, ...). `.env.example` and other templates are fine.
 *   - inside a migration folder that is already on the default branch. An applied migration is never edited; add a
 *     new one. The default branch is `defaultBranch` in .claude/workflow.json; the hook asks git whether the folder
 *     exists at `origin/<branch>`, then at `<branch>`. When neither ref exists, or git is not there, it allows the
 *     edit and says so in one line.
 *
 * Root: the git toplevel of the edited file (so a worktree is its own root); without git, $CLAUDE_PROJECT_DIR, then
 * the hook's cwd. Node built-ins only. Tested by .claude/hooks/tests/hooks.test.mjs.
 */
import path from 'node:path';
import process from 'node:process';
import { globToRegExp } from '../../tools/guards/skills-guard.mjs';
import { isEntryModule } from '../../tools/guards/workflow-config.mjs';
import { editedFile, emitContext, git, readInput, relativeTo, resolveRoot, runHook, workflowConfig } from './lib.mjs';

/** Generated files, as repo-relative globs, and the command that regenerates each. */
export const GENERATED = [
  { glob: 'packages/shared-types/src/generated/**', how: 'pnpm --filter @appshore/db prisma:generate' },
  { glob: 'packages/appshore/db/generated/**', how: 'pnpm --filter @appshore/db prisma:generate' },
  { glob: 'apps/backend/openapi.json', how: 'pnpm --filter @app/backend openapi:generate' },
  { glob: 'apps/backend/public-openapi.json', how: 'pnpm --filter @app/backend openapi:generate' },
  {
    glob: 'infra/observability/grafana-cloud/{alerting,dashboards}/**',
    how: 'edit infra/observability/grafana-cloud/catalog/, then node infra/observability/grafana-cloud/scripts/generate.mjs',
  },
];

const ENV_TEMPLATE = /\.(example|sample|template)$/;
export const isRealEnvFile = (rel) => {
  const base = path.posix.basename(rel);
  return (base === '.env' || base.startsWith('.env.')) && !ENV_TEMPLATE.test(base);
};

/** The migration folder a path is inside (`.../prisma/migrations/<name>`), or null. */
export const migrationDir = (rel) => rel.match(/^(.*?(?:^|\/)prisma\/migrations\/[^/]+)\//)?.[1] ?? null;

function block(reason) {
  process.stderr.write(`protected-paths: ${reason}\n`);
  process.exit(2);
}

function main() {
  const input = readInput();
  const file = editedFile(input);
  if (!file) return;
  const { root, git: hasGit } = resolveRoot(file, input);
  const rel = relativeTo(root, file);

  if (isRealEnvFile(rel ?? path.basename(file)))
    block(
      `${rel ?? file} is a real env file, which holds secrets and is never edited by an assistant. Change the matching .env.example and tell the user what to set; secrets live in Doppler (docs/doppler.md).`,
    );
  if (!rel) return;

  const generated = GENERATED.find((g) => globToRegExp(g.glob).test(rel));
  if (generated) block(`${rel} is generated; do not edit it by hand. Regenerate it: ${generated.how}.`);

  const dir = migrationDir(rel);
  if (!dir) return;
  const branch = workflowConfig(root).defaultBranch || 'main';
  if (!hasGit) {
    emitContext('PreToolUse', [
      `protected-paths: no git here, so ${dir} could not be checked against ${branch}; the edit is allowed. Never edit a migration that has been applied anywhere: add a new one.`,
    ]);
    return;
  }
  const refs = [`origin/${branch}`, branch].filter(
    (ref) => git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).ok,
  );
  if (!refs.length) {
    emitContext('PreToolUse', [
      `protected-paths: neither origin/${branch} nor ${branch} exists, so ${dir} could not be checked; the edit is allowed. Never edit a migration that has been applied anywhere: add a new one.`,
    ]);
    return;
  }
  for (const ref of refs)
    if (git(root, ['cat-file', '-e', `${ref}:${dir}`]).ok)
      block(
        `${dir} is already on ${ref}, so it may have been applied somewhere; an applied migration is never edited. Add a new migration (pnpm --filter @appshore/db prisma:migrate --create-only) that changes what you need.`,
      );
}

if (isEntryModule(import.meta.url)) runHook(main);
