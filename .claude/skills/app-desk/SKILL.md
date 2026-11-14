---
name: app-desk
description: Use when planning or building a NEW Desk responsibility (an autonomous AI duty on the Inngest workflow engine at apps/backend/src/domains/desk) — e.g. "add a Desk responsibility for X", "automate this recurring duty", or promoting a COMING_SOON stub to AVAILABLE. Encodes the research, plan, execute, review pipeline and the hard-won conventions so a new responsibility ships consistently.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
owner: foundation
requires: desk
---

# Desk — add a new Desk responsibility

The Desk domain (`apps/backend/src/domains/desk/`) is a durable AI workflow engine: autonomous "responsibilities" run as Inngest-orchestrated episodes with human-in-the-loop approval, trust levels, and memory. The starter ships ONE no-op example (`welcome`) and an **empty registry** — this skill turns a responsibility idea into a shipped, reviewed PR.

**Announce at start:** "Using app-desk to plan and ship the `<key>` responsibility."

> Vocabulary (NON-NEGOTIABLE): **responsibility / episode / step**. An **agent** is the AI employee persona; a **responsibility** is one duty it owns. An **episode** is one run of a responsibility against one entity. A **step** is a discrete durable operation inside the episode. `COMING_SOON` is a real definition with `lifecycle: 'COMING_SOON'`, not a stub of missing code.

---

## 0. Read the canon first

- [`references/building-a-responsibility.md`](references/building-a-responsibility.md) — the folder layout, the
  task spine, the registration touchpoints and the hard-won gotchas. The plan and the executor both need it.
- The **`app-conventions`** skill for every backend rule a responsibility's code follows (its index, then the
  reference for the area you touch), plus the Desk rules and the full architecture below.
- `apps/backend/src/domains/desk/responsibilities/index.ts` — the registry, with the `welcome` example and the add-a-responsibility checklist in its doc comment.
- `apps/backend/src/domains/desk/responsibilities/definition.types.ts` — the `ResponsibilityDefinition` contract (the spec).

### Desk rules (the summary)

- Steps run in Inngest workers, not HTTP: **throw plain `Error`**, not NestJS exceptions.
- The gate algorithm (`core/gate/gate.algorithm.ts`) is pure and job-blind; per-responsibility conditions ride in through
  the definition's `conditionsEvaluator`.
- Trust thresholds are single-source in shared-types (`TRUST_LEVEL_CONFIDENCE_THRESHOLDS`); never inline them.
- Responsibilities call existing domain services through MCP tools in the execute step; never duplicate business logic.
  Every Desk tool call runs through the one tool pipeline (the `app-conventions` reference
  [`ai-tools.md`](../app-conventions/references/ai-tools.md)): the plan check runs for a Desk duty, the role check and
  the pipeline's confirmation do not, because Desk's gate step runs before every execute.
- Use `DESK_OUTCOMES` constants (`shared-steps/outcomes.ts`), never bare outcome strings.
- LLM steps go through `runStructuredLlmStep()` (`shared-steps/_llm-step.helper.ts`): prompt through PromptingService,
  Zod-validated output, cost-ledger logging, with `aiContext.surface` set to `AiSurface.DESK_STEP`.
- Desk workflow functions run over HTTP, so they stay in the API process even when `QUEUE_PROCESSORS_ENABLED=false`
  makes it producer-only.

### Desk stays removable

Desk is chosen at scaffold time and reached only through `apps/backend/src/platform-glue/features/desk.feature.ts`
(`OPTIONAL_FEATURES`; held by `apps/backend/src/architecture/optional-features.spec.ts`).

- A Desk change stays inside `apps/backend/src/domains/desk/`.
- A Desk-only line outside that folder (an env line, a doc line, a seed row, a package script) sits between
  `feature:desk:start` and `feature:desk:end` comment lines, and its file is listed in
  `tools/init-app/features/desk.json` (`markers`). A Desk-only file goes in `paths`; a JSON key or array value in
  `jsonEntries`; an allowlist entry under the Desk folder is covered by `allowlistPrefixes`.
- A line that must stay in every product and still names `inngest` or `domains/desk` (a guard that tests whether the
  Desk folder exists) goes on `tools/init-app/features/desk.residue.json` with its reason.
- `pnpm verify:scaffold` proves both scaffolds (`--desk no`, `--desk yes`) still install, type-check and pass. Run it
  before a pull request that touches `tools/init-app/`, `platform-glue/features/`, a file the manifest names, or a Desk
  file outside the Desk folder. The Desk tables stay in the schema either way, empty without Desk.

### The step pipeline

Inngest orchestrates the workflow as durable steps. Typical flow:

1. **hydrate** — load the entity + conditions snapshot + relevant memories + preflight check (proceed/skip/abort). No LLM. Shapes from `shared-steps/step.types.ts`.
2. **perceive** (LLM) — classify the entity's state; emit confidence.
3. **decide** (LLM) — act, skip, or escalate; emit confidence.
4. **draft** (LLM or deterministic) — compose the proposed action; emit confidence.
5. **gate** (shared step) — conditions + trust level + confidence → approve or gated. The conditions evaluator is supplied per-responsibility; the gate stays job-blind.
6. **execute** (shared step) — run the MCP tool via the invocation pipeline (agent principal with responsibility-scoped permissions).
7. **close** (shared step) — set episode status/outcome, write memory, reinforce used memories, and stage a domain event with the status write (`OutboxService.transaction`).

**Events in and out of Desk are at least once** (ADR "Outbox and deadlines"). Every Desk write that raises an event stages it in its own transaction through `OutboxService`, never `DomainEventService.emit` after the commit (`no-direct-emit.spec.ts` fails on it). A handler added to the domain-event bridge (`core/trigger/domain-event-bridge.service.ts`) can see one event twice, so it closes episodes with an idempotent `updateMany`, and when it sends an Inngest event it passes the domain event's id as the Inngest event id (`inngest.send({ id: event.id, … })`) so Inngest drops the copy.

**Gate algorithm** (`core/gate/gate.algorithm.ts` — pure, no side effects, unit-testable):

- Tool tier: read (never gate) | sensitive (always gate) | standard (trust rules below)
- `SUPERVISED` — always gate standard tools
- `ASSISTED` — auto-pass if conditions met AND confidence ≥ the ASSISTED threshold (0.90)
- `AUTONOMOUS` — auto-pass if confidence ≥ the AUTONOMOUS threshold (0.75)
- Thresholds live ONLY in `TRUST_LEVEL_CONFIDENCE_THRESHOLDS` (`core/types/enums.ts`). Never inline them.

**LLM steps** call `runStructuredLlmStep()` (`shared-steps/_llm-step.helper.ts`):

- Loads the system prompt via PromptingService (Langfuse primary, code fallback)
- Calls `StructuredOutputService.extract()` (AI SDK — the sanctioned workflow-shaped path, not the Mastra agent runtime)
- Validates against a Zod schema; opens/succeeds/fails a step row; logs cost to the AI spend ledger

**Approval flow** — when gated:

- The approval service creates an approval row keyed to the gate step.
- The workflow calls `step.waitForEvent('app/desk.approval.decided', { match: 'data.approvalId' })` with a timeout.
- Operator approves / edits / rejects / times out → the event fires; the workflow resumes or closes.

---

## 1. Pick the responsibility + classify its ACT (the load-bearing decision)

A responsibility attaches to an agent from the agent registry (seeded per tenant — see `responsibilities/bootstrap-desk-for-tenant.ts`; the starter ships a generic `assistant`). Adding a new agent persona is a bigger change — brainstorm it first.

Every responsibility MUST end in a real act. **Classify it before planning — this shapes the whole workflow:**

| Act shape                           | Terminal tool                                        | Notes                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outbound message**                | a send-email / send-message / send-sms MCP tool      | Recipient MUST be pinned from hydrate, never from the LLM draft.                                                                                                     |
| **State write**                     | a domain mutation MCP tool (approve, create, assign) | EDITED approvals may legitimately change _some_ args; pin the entity id. If the write tool doesn't exist yet, **building the MCP tool is its own task** first.       |
| **No outbound act (decision-only)** | —                                                    | ⚠️ The execute step requires a real tool+scope; shipping `tools: []` for an automated duty is a NEW runtime pattern — resolve the act with the user before planning. |

**If the act is unclear or "decision-only", STOP and ask the user** — present the options (raise an alert via an MCP tool / pick a concrete write / genuinely decision-only-and-accept-the-new-pattern). Do not invent a decision-only flow silently.

**Default trust: SUPERVISED. Triggers: declare the domain-sensible ones** — a `scheduled` cron at the cadence the duty needs (and/or a `domain-event` where one fits, e.g. `app.project.created`) — **plus `{ kind: 'manual' }`**.

> **"Manual only / don't auto-run yet" means DISABLED BY DEFAULT, not stripped triggers.** Do NOT ship `triggers: [{ kind: 'manual' }]` to satisfy a "no automation yet" ask — that permanently removes the automation path. Automation is already off by default and independently gated: the scheduler (`core/scheduler/desk-scheduler.service.ts`) only fires a responsibility that is **enabled AND autonomy-armed AND under the tenant master switch (`Tenant.deskScheduleEnabled`, off by default)**. A declared cron/event trigger never fires unattended until the operator turns it on. Declare the real triggers; let the gating keep them quiet.

---

## 2. Find the SENSOR (don't build one)

Sensor/actuator is the law: existing engines and services DETECT; the responsibility ACTS on a slice of their output. Before planning, identify the sensor and confirm it exists:

- **An existing detection/monitoring engine's findings or alert rows** — ride them; mind staleness (trigger a fresh scan if the latest run is old) and verify which fields are actually persisted (you may need to reconstruct derived values).
- **Entity columns** — due dates, overdue flags, unassigned records: a cheap tenant-scoped Prisma query.
- **A domain service** — hydrate can resolve any service from the root Nest container (see the gotchas in [the build reference](references/building-a-responsibility.md)) and call it directly.

**Dispatch an Explore agent** to map the sensor: its exact output shape, freshness, the MCP tools that read it, and any gap. This research step pays for itself every time.

---

## 3. Plan via `app-plan`

Invoke **`app-plan`** with the responsibility brief + the research findings. The plan MUST:

- Name the reference responsibility (or the `welcome` example) to mirror file-for-file.
- Contain **complete code for the novel files** (schemas, fan-out, conditions-evaluator, definition) and **exact deltas + reference pointers** for the template-mirroring files (steps, workflow, adapters, registration).
- Flag every **verification read** (Prisma field names, tool param names, service signatures) the executor must do before writing.
- List the **registration touchpoints** and use the **task spine**, both in
  [`references/building-a-responsibility.md`](references/building-a-responsibility.md).

---

## 7. Execute → review → fix → PR

1. **Execute** via `app-execute` (or a background `Agent` per the plan if running several in parallel). Hand the executor the plan path, the gotchas in the build reference and the recovery rule (commit per task).
2. **Review** the resulting PR via `app-review` (a fresh agent). Watch especially: tenant scoping on every query, recipient/id pinning, the act-tool contract match, sensor reconstruction correctness, and the Desk conventions above.
3. **Apply review fixes** (approve-with-fixes is the norm — the fixes are usually small). Push.
4. **PR body** states: the sensor→act wiring, the trigger cadence + the disabled-by-default note (automation off until enabled + armed + master switch), the merge-conflict note vs sibling open PRs, and test evidence.

---

## Red flags — STOP and fix

- The act is "decision-only" and you're about to ship `tools: []` for an automated duty without confirming the new-pattern risk with the user.
- Recipient/entity id sourced from the LLM draft instead of hydrate.
- `triggers` is `[{ kind: 'manual' }]` only for a duty that has a natural cadence — you stripped the domain trigger instead of leaving it disabled-by-default.
- You added a responsibility key, outcome or event and ran only the specs, not `pnpm build` (ts-jest does not type-check, so a missing `Record` entry passes the tests).
- A new domain enum/status hand-written instead of added to the Prisma schema (see the `app-conventions` database
  reference, [`database.md`](../app-conventions/references/database.md), "Enums").
- Trust thresholds inlined instead of imported from `TRUST_LEVEL_CONFIDENCE_THRESHOLDS`.
- Skipping `app-plan` or `app-review` — this skill wraps them, it doesn't replace them.

## What NOT to do

- Don't re-implement a sensor inside a responsibility — ride the existing engine's output.
- Don't duplicate business logic — the act calls an existing domain service via an MCP tool.
- Don't hand-write gate/trust logic — it rides in via the definition's `conditionsEvaluator`; the gate stays job-blind.
- Don't use bare outcome strings — `DESK_OUTCOMES` constants only.
