# scripts/

Repo-data utilities: scripts that read source/repo data and emit derived artifacts back into the working tree (wiki Sources, codegen, reports). For environment/operator tooling (DB tunnels, Docker, AWS, Stripe), use `tools/` instead.

## Files

| Script                  | What it does                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `sync-vault.sh`         | Mirrors project memory + root docs into `Obsidian Vault/SALLY/Sources/`. Run after editing memory files, CLAUDE.md, or design docs. |
| `export-scope-vocab.ts` | Emits a wiki-readable snapshot of the scope vocabulary from `packages/shared-types/`. Invoked via `pnpm docs:scope-vocab`.          |

## What goes here

- **Reads from the repo, writes back into the repo.** Codegen, wiki/doc sync, vocab/schema exports, repo audits, lint helpers that emit reports.
- **TypeScript or Node-flavored shell.** Things that need the repo's TS toolchain or shared-types package.

## What does _not_ go here

- **Operator scripts** (DB tunnels, migrations, Docker, AWS, Stripe sync, dev launchers) → `tools/`
- **TypeScript scripts that need a specific app's dep graph** (Prisma client, NestJS bootstrap) → `apps/<app>/scripts/`
- **Infrastructure code** (Terraform) → `infra/`
