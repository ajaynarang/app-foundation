# Cloud environments (Claude Code on the web)

How each product's cloud environment is set up, so the settings are never lost. A cloud environment is set up in
claude.ai; this folder is the written record of it, and the scripts it runs live in each repo.

**No secret values ever go in this folder.** Tokens are entered only in the environment's settings in claude.ai.

## How a cloud session works

1. Every new session gets a **fresh Linux machine** (Ubuntu, x86_64) with an empty disk. There is no choice of
   operating system, and nothing is shared with your Mac or its Docker Desktop.
2. The environment's **setup script** runs on that machine first, before Claude starts.
3. The session then runs **on that same machine**. Whatever the setup script left on its disk is still there.
4. When the session is over and the machine is reclaimed, **everything on it is deleted**: Docker, images, the
   database. The next fresh session starts empty and the setup script builds it all again.

So the cloud database is disposable. Anything worth keeping has to be committed and pushed.

## What the setup does

Every repo keeps everything for its cloud environment in `tools/cloud-env/`: `setup-script.sh` (the exact text pasted
into the environment's "Setup script" box), `session-start.sh` (run by Claude at the start of each session) and a short
`README.md`. The template's own copies are in this folder.

The setup script does almost nothing itself. It
calls the repo's own **`tools/dev/install.sh`**, the same script a Mac runs, so there is one setup to maintain:

1. `tools/dev/docker-up.sh postgres redis` starts Docker if it is off (on Linux it starts the daemon; on a Mac
   Docker Desktop must be open), then the compose services, and waits for Postgres.
2. `pnpm install --frozen-lockfile`.
3. Prisma generate, then the shared and foundation packages.
4. Migrations and base seeds. The database address is read from the **running Postgres container**, never from
   an env file, so it cannot be out of date. Doppler is not used here: a setup script cannot read the
   environment's variables or secrets.

The setup script then stops Docker. The images and the migrated database stay on the machine's disk.

**At the start of each session**, run `tools/cloud-env/session-start.sh` (the repo's CLAUDE.md says so, so Claude does
it). It is the part that needs the environment's variables, which only exist once the session runs:

1. `tools/dev/docker-up.sh` brings Docker and every compose service back, database included. A service whose image
   cannot be pulled is skipped with a warning (see MinIO below) instead of failing the rest.
2. It points the Doppler CLI at the dev configs: each app directory's `doppler.yaml` names its project, and the
   token for `<product>-<app>` comes from the variable `DOPPLER_TOKEN_<APP>`. The backend token also covers the repo
   root. After this, `pnpm doppler:backend` and the `pnpm test:*:local` scripts work as on a Mac.
3. It rebuilds and migrates, because the session's branch may be ahead of the default branch the setup script used.

Measured on a fresh machine: 45 to 70 seconds per product for the setup script, 30 to 60 seconds for
`session-start.sh`.

## What each setting means

| Setting                | In plain words                                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Name                   | A label to pick the environment from the menu. Nothing technical.                                                                                                                        |
| Repositories           | Which repos the environment is for. New sessions on those repos suggest it.                                                                                                              |
| Scope                  | Personal: only you can use it. Organization: everyone in the org can, setup script included.                                                                                             |
| Network access         | A guest list for the internet. Limited means only the listed sites plus a few defaults; everything else is blocked.                                                                      |
| Allowed domains        | The guest list itself, for example `api.doppler.com`.                                                                                                                                    |
| Allow package managers | A ready-made list of npm, PyPI, apt, Docker Hub and similar. Leave it on, or installs fail.                                                                                              |
| Allow MCP servers      | Lets the session reach your connected tools (Linear, Notion, Vercel). Leave it on.                                                                                                       |
| Environment variables  | Named values every program can read, like `PORT=8001`. Stored in plain text and visible to anyone who can run commands in the session. Not readable by the setup script.                 |
| Network secrets        | A key the session never holds: the network gateway adds it to requests to one named site on the way out. Commands can use it but cannot read it. Cannot be used for Anthropic's own API. |
| Setup script           | Commands that run once on each fresh machine, as root, before Claude starts. Cannot read variables or secrets.                                                                           |

## Doppler tokens: environment variables, not network secrets

Each app has its own Doppler project, so each gets its own variable (`DOPPLER_TOKEN_BACKEND`,
`DOPPLER_TOKEN_FRONTEND`, ...). Use a **read-only service token for the `dev` config only**, never a personal token.

Why a variable and not a network secret:

- The Doppler CLI reads its token from a variable, so this is certain to work.
- A network secret protects less than it sounds here: anything that can run Doppler in the session can fetch every
  secret in that config anyway.
- The environments are personal, so no one else sees the variables.

Run an app with its token, for example:

```bash
cd apps/backend && DOPPLER_TOKEN="$DOPPLER_TOKEN_BACKEND" doppler run -- pnpm run dev
```

## The environments

| Folder                      | Repository              | Its setup script                                                        |
| --------------------------- | ----------------------- | ----------------------------------------------------------------------- |
| `environments/sally/`       | `app-shore/sally`       | `tools/cloud-env/setup-script.sh` in sally (own `install.sh`, RLS role) |
| `environments/throughline/` | `app-shore/throughline` | `tools/cloud-env/setup-script.sh` in throughline                        |
| `environments/tournax/`     | `app-shore/tournax`     | `tools/cloud-env/setup-script.sh` in tournax                            |

Each folder holds `settings.json`: everything to type into claude.ai that lives nowhere else (scope, allowed hosts,
variable names), secrets as placeholders. The setup script itself lives in the product's repo, one copy only. Change
the environment, then change its `settings.json`.

## A new product

1. A product scaffolded from this template already has `tools/cloud-env/`, and init-app sets `REPO` to its name. An
   older product copies this folder's `setup-script.sh` and `session-start.sh` into its own `tools/cloud-env/` and
   sets `REPO`.
2. Copy an existing `settings.json` and set the name, repository and one `DOPPLER_TOKEN_<APP>` per Doppler project.
3. In claude.ai, create the environment from those two files, then enter the real tokens there.

## Known limits

- **The Doppler CLI is not installed by these scripts yet.** `session-start.sh` needs it on the machine and skips
  Doppler without it. Add its install to each environment's setup script (`cli.doppler.com` is on the allowed list
  for that), then record the line here. The sally environment's current setup script may already have it; it could
  not be read when this folder was written.

- **MinIO.** `minio/minio` and `minio/mc` were removed from Docker Hub. The template now uses `pgsty/minio`, which
  pulls fine; a product still on the old image gets MinIO skipped in the cloud (a Mac usually has the old image
  cached) until it takes the template's `docker-compose.yml` change.
- **One product per machine.** The products' compose files share some host ports (Inngest's 8288), so two of them
  cannot run their services at the same time on one machine. Each environment holds one product, so this only
  matters when testing several by hand.
