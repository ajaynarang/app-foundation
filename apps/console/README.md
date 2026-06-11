# the platform Console

> **Status:** Docs-only mode. Console features (settings, account, team, developer tools) have been merged into the main web app (`apps/web`). This app now serves as a standalone documentation viewer.

## Docs-Only Mode

Set `NEXT_PUBLIC_DOCS_ONLY_MODE=true` in `.env.local` to enable:

- Root `/` redirects straight to `/docs`
- No authentication required to view docs
- Header shows "the platform Docs" with a "Back to the platform" link
- Console dashboard/sidebar are inaccessible — all authenticated routes redirect to `/docs`

Without this env var, the console runs in its original full mode (sidebar, auth, all pages). This is kept as a fallback until the web app integration is fully validated.

## Development

```bash
cp .env.example .env.local   # optional — all vars have localhost fallbacks
pnpm dev                     # Starts on port 3002
```

## Relevant env vars

See [`.env.example`](./.env.example) for the full annotated reference.

| Variable                     | Purpose                                                         |
| ---------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_DOCS_ONLY_MODE` | `true` = docs viewer only, `false`/unset = full console         |
| `NEXT_PUBLIC_APP_URL`        | Main web app URL (login redirects, "Back to the platform" link) |
| `NEXT_PUBLIC_API_URL`        | Backend API URL                                                 |
| `NEXT_PUBLIC_CONSOLE_URL`    | This console's own URL (used in docs deep links)                |
| `NEXT_PUBLIC_TENANT_APP_URL` | Base URL for per-tenant app deep links (defaults to `/`)        |
| `NEXT_PUBLIC_FIREBASE_*`     | Firebase web config for full-console auth mode (six vars)       |
| `OPENAPI_URL`                | Build-time: source URL for `scripts/sync-openapi.js` (optional) |
