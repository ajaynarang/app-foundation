# scripts/

Repo-data utilities: scripts that read source/repo data and emit derived artifacts back into the working tree (codegen, reports). For environment/operator tooling (DB tunnels, Docker, dev launchers), use `tools/` instead.

This directory is currently empty — it's a placeholder for your own repo-data scripts.

## What goes here

- **Reads from the repo, writes back into the repo.** Codegen, doc sync, vocab/schema exports, repo audits, lint helpers that emit reports.
- **TypeScript or Node-flavored shell.** Things that need the repo's TS toolchain or shared packages.

## What does _not_ go here

- **Operator scripts** (DB tunnels, migrations, Docker, dev launchers) → `tools/`
- **TypeScript scripts that need a specific app's dep graph** (Prisma client, NestJS bootstrap) → `apps/<app>/scripts/`
- **Infrastructure code** (Terraform) → `infra/`
