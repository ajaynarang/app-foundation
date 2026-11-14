# Documentation

Everything a product built from this starter decides, and how it runs. The root [`CLAUDE.md`](../CLAUDE.md) is the
entry point for a working session: it lists the binding docs below and the code conventions.

## Binding docs: the architecture of record

Product work follows these. Deviating from one is allowed only as an amendment to it in the same pull request as the
code. In the starter they are skeletons: the "Foundation (already here)" sections describe what the starter ships,
and each "Your product" section says how to fill it during the product's first days.

| Doc                                                            | What it binds                                             |
| -------------------------------------------------------------- | --------------------------------------------------------- |
| [`VISION.md`](VISION.md)                                       | Who the product is for, what it does, what it will not do |
| [`domain-map.md`](domain-map.md)                               | Every entity, what it means, how entities relate          |
| [`lifecycles-and-invariants.md`](lifecycles-and-invariants.md) | The always-true rules and every state machine             |
| [`module-map.md`](module-map.md)                               | Which folder owns what, and which way dependencies point  |
| [`event-vocabulary.md`](event-vocabulary.md)                   | Every domain event, by name                               |
| [`epics.md`](epics.md)                                         | Build order, and what "demoable" means for each epic      |
| [`adr/`](adr/README.md)                                        | The decisions that are expensive to change, and why       |

Fill them in this order: vision, domain map, lifecycles and invariants, the first ADRs, event vocabulary, module map,
epics. The `app-runway` skill (`/app-runway`) walks the order with the owner, then fills the product's domain skill.

## Decisions

- [`adr/`](adr/README.md): architecture decision records, with the index, how a number is taken and how to amend.
  The starter's own records cover the API contract, the ID boundary, the outbox and deadlines, optional features,
  AI provider routing, the outbound gate, manual CI, package layering, tenancy, enums and vocabularies, the one
  database, credentials at rest, outbound webhooks, the one web app and the workflow. Start a new one from
  [`adr/0000-template.md`](adr/0000-template.md).

## How work is done

- [`how-we-build.md`](how-we-build.md): the playbook: the three sizes of work, the loop and the skills that run it,
  the agents, who does what, the local gates, and the three steps that turn CI on.
- [`adding-your-domain.md`](adding-your-domain.md): the domain seam: the one skill where a product writes its own
  vocabulary, personas, review checks and exceptions, and the four places the workflow reads it.

## Standards

- [`standards/observability.md`](standards/observability.md): the rules every log line, metric, trace and error
  report follows.
- [`standards/id-convention.md`](standards/id-convention.md): the six roles an id column can have, and the one that
  crosses the API.
- [`standards/column-naming.md`](standards/column-naming.md): how schema fields and columns are named (held by
  `pnpm lint:schema`).

## Running a product

- [`operations.md`](operations.md): procedures for a product with real users: duplicate accounts, the outbound gate,
  deploy, migrations and the tunnel, containers and task roles, the maintenance switch, tenant reset, staging data on
  a laptop, process switches, and how CI is run.
- [`observability.md`](observability.md): where errors, logs, traces and metrics go, and which keys switch each on.
- [`runbooks/`](runbooks/README.md): one section per alert rule.
- [`doppler.md`](doppler.md): secrets and environment configuration.

## Upgrading

- [`upgrade-notes/`](upgrade-notes/contract-v1.md): what changed, for a product scaffolded before a change and pulling
  it now. [Contract v1](upgrade-notes/contract-v1.md): the wire. [AI platform](upgrade-notes/ai-platform.md): AI
  behaviour, env and schema. [Operations](upgrade-notes/operations.md): sessions, logging, error tracking, telemetry,
  alerts, safety gates and deploy.

## What the starter ships

- [`WHAT-YOU-GET.md`](WHAT-YOU-GET.md): the feature list.
