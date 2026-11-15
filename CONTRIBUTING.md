# Contributing

Thanks for your interest in contributing! This project is licensed under the
[MIT License](LICENSE); by submitting a contribution you agree that it will be
distributed under the same license.

## How to Contribute

1. Create a feature branch from `main`.
2. Make your changes following the project's code conventions (see [CLAUDE.md](CLAUDE.md)).
3. Submit a pull request to `main` with a clear description of the changes.
4. Run `pnpm verify` and paste its last line (`verify: PASS …`) into the pull request description. CI is manual by default, so this local gate is what a pull request must pass; the pre-push hook also runs the architecture specs on every push. You can still run the `CI` workflow on your branch from the Actions tab (or `gh workflow run ci.yml --ref <branch>`).

## Guidelines

- Keep changes focused — one logical change per pull request.
- Add or update tests for any behavior you change.
- `pnpm verify` runs the format check, lint, schema lint, type-check, unit tests and build in one go. It needs Postgres and Redis for the integration specs (`docker compose up -d postgres redis`).
- If your change moves the wire (a status code, a route, a response or error body), also run `pnpm verify:api` and paste its last line (`verify:api: PASS …`). It boots the built backend and runs the Playwright `api` project against it. Export `DATABASE_URL` and `REDIS_URL` first; it migrates and seeds that database and has no default for either.

## Questions

Open a GitHub issue or discussion in this repository.
