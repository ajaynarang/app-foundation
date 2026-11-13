# Documentation

Project conventions and the domain map live in the root [`CLAUDE.md`](../CLAUDE.md).
Add your own product documentation here as you build.

- [`adr/`](adr/README.md): architecture decision records. Start with
  [API contract](adr/0001-api-contract.md): status codes, the error envelope and its codes, inputs, lists,
  versioning. [ID boundary](adr/0002-id-boundary.md): which ids cross the API, and the public id a table takes.
  [Outbox and deadlines](adr/0003-outbox-and-deadlines.md): an event exists if and only if its write committed;
  a timer is a row. [Optional features](adr/0004-optional-features-desk-opt-in.md): Desk is chosen at scaffold
  time, and removed only through its seam and manifest.
- [`upgrade-notes/`](upgrade-notes/contract-v1.md): what changed on the wire, for a product scaffolded before a
  change and pulling it now. [AI platform](upgrade-notes/ai-platform.md): AI behaviour, env and schema changes,
  and the deploy order for the `ai_reader` role. [Operations](upgrade-notes/operations.md): sessions, logging,
  error tracking, telemetry, alerts, safety gates and deploy.
- [`operations.md`](operations.md): running a product with real users. Today: listing and merging duplicate
  accounts.
- [`doppler.md`](doppler.md): secrets and environment configuration.
- [`WHAT-YOU-GET.md`](WHAT-YOU-GET.md): what the starter ships.
