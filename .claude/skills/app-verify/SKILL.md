---
name: app-verify
description: Drive the running app (the NestJS API and the Next.js web app) to observe a change actually working, rather than trusting the unit tests. Use when verifying a change end to end — especially anything that crosses the web, API and database seam — and before saying a UI or wire change is done. Names the three traps (which port, which build, which database) and how to rule each out.
user-invocable: true
allowed-tools: Bash, Read, Glob, Grep, Agent
owner: foundation
---

# Verify against the running app

Unit tests mock Prisma, the queue and `fetch`, so they cannot see a missing migration, a serializer that drops a
field, a web hook reading the wrong key, or a stale build. Drive the real thing. For a long scripted walk, hand it to
the `app-qa-runner` agent so the transcript stays out of your context.

The app is two processes: the backend (`apps/backend`, NestJS, port 8000, routes under `/api/v1`) and the web app
(`apps/web`, Next.js, port 3000, calling the API at `NEXT_PUBLIC_API_URL`). Each can be the wrong one. Answer the three
questions below before trusting any result.

## Trap 1 — which port: whose code is answering?

Another worktree's `pnpm dev`, a side-by-side run (`pnpm dev:side`, ports 8001 and 3001 by default), or a session that
never exited may hold the port. You would be testing that code.

```bash
for p in 8000 3000; do P=$(lsof -tiTCP:$p -sTCP:LISTEN | head -1); [ -n "$P" ] && echo "$p: $(ps -o command= -p $P) (cwd $(lsof -a -p $P -d cwd -Fn | sed -n 's/^n//p'))"; done
```

If the process is not running from your checkout, start yours on other ports (`tools/dev/app-dev.sh --backend <port>
--web <port>`) rather than killing something you did not start. Then point the web app at your backend: the web app
calls whatever `NEXT_PUBLIC_API_URL` says, not the backend next to it.

## Trap 2 — which build: is the code you wrote the code that runs?

- **The foundation packages run from their `dist`.** The backend consumes `@appshore/kernel`, `@appshore/db`,
  `@appshore/platform` and `@app/shared-types` built. A change in `packages/` is invisible until it is rebuilt:
  `pnpm --filter @appshore/kernel --filter @appshore/db --filter @appshore/platform build` (and
  `pnpm --filter @app/shared-types build`). `pnpm backend:dev` rebuilds db and shared-types on start, not on change.
- **The Prisma client is generated.** After a schema change or a rebase, `pnpm backend:prisma:generate`; a stale
  client looks exactly like a real type error.
- **The web app caches.** After a branch switch or a package change, a page that "does not take effect" is usually a
  stale `apps/web/.next`: stop `next dev`, delete that folder, start again. Never run `next dev` on top of a
  `next build` output.
- **A watcher can die quietly.** Check the backend terminal for a compile error before concluding the change failed.

## Trap 3 — which database: where would a write land?

The backend reads `DATABASE_URL` and `REDIS_URL` (from `apps/backend/.env`, Doppler or the shell). Before any write,
print the host and port, never the password:

```bash
node -e 'const u=new URL(process.env.DATABASE_URL);console.log(u.hostname+":"+u.port+u.pathname)'
```

The local compose database is port 5499 (`docker-compose.yml`). The staging-debug copy (`pnpm stg-debug:up`, port 5495) holds a copy of staging data: read it, do not test writes on it unless the owner said so in this session. A
deployed database is never a test target for a write. Migrations run with `pnpm --filter @appshore/db
prisma:migrate:deploy` against the URL in the environment; check it first.

## Recipes

**Health.** `curl -s localhost:8000/api/v1/health/ready` — database and Redis reachable, or a 503 naming which.

**Sign in with curl.** The seeds create `owner@example.com`, `admin-user@example.com` and `member@example.com` in the
demo workspace and the super-admin `admin@example.com`, all with the dev password (`dev-credentials.ts` in the db
package's seeds). Write the body to a file, never pipe `-w` text into a JSON parser:

```bash
curl -s -o "$TMPDIR/login.json" -w 'HTTP %{http_code}\n' -X POST localhost:8000/api/v1/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"owner@example.com","password":"<dev password>"}'
TOKEN=$(node -e 'console.log(require(process.env.TMPDIR + "/login.json").accessToken)')
```

A 409 `WORKSPACE_SELECTION_REQUIRED` lists `workspaces`: retry with one `tenantId`.

**Hit a route.** `curl -s -H "Authorization: Bearer $TOKEN" localhost:8000/api/v1/<route>`. Check what the contract
says, not only the status: camelCase keys, public ids and never an `Int` id, the error envelope (`code`, `detail`,
`fieldErrors`) on a failure. For a create, send it twice with the same `Idempotency-Key`: the second answer replays
the first. Check the row in the database too (`psql "$DATABASE_URL" -c '…'` against the URL you printed).

**Verify a create, not an update.** An update to a row that is already right proves nothing. Drive the path that
writes the field for the first time.

**Background work.** An event leaves through the outbox and a timer fires on the `deadline-sweep` job, so neither is
instant. Wait for the next sweep, then check the result (the admin timers page `/admin/timers` shows each timer).

**Outbound sends.** Outside production the outbound gate sends only to the allow-list. A held-back email is correct
behaviour: check Held back on `/admin/outbound`.

**The browser.** Client-rendered pages look the same to `curl` whether the feature works or not; drive a browser
(the Playwright or Chrome tools). Prefer the accessibility snapshot over a screenshot: it quotes the rendered text.
Take a screenshot only for a visual claim, save it in the session scratchpad or a gitignored folder, never commit it.
Check the console for errors before concluding a page failed; a first compile is slow.

**Both themes, three widths.** Toggle the theme and re-check; resize to 375, 768 and 1440. A colour that is not a
theme token shows up here and nowhere else.

**Another tenant, another role.** Sign in as a second role, and in a second workspace, and repeat the read: another
tenant's record is a 404, a role refusal a 403.

## Report

What you ran, on which port and build, against which database host; what you saw (status codes, bodies, rendered
text); a verdict, WORKS, BROKEN or PARTIAL, with the evidence. Name anything you could not check and why. Never report
success for a step you skipped.
