---
name: desk-patterns
description: Use when planning or building a NEW Desk responsibility (an autonomous AI duty on the Inngest workflow engine at apps/backend/src/domains/desk) — e.g. "add a Desk responsibility for X", "automate this recurring duty", or promoting a COMING_SOON stub to AVAILABLE. Encodes the proven research→plan→execute→review pipeline and the hard-won conventions so a new responsibility ships consistently.
user-invocable: true
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent, Skill
---

# Desk Patterns — add a new Desk responsibility

The Desk domain (`apps/backend/src/domains/desk/`) is a durable AI workflow engine: autonomous "responsibilities" run as Inngest-orchestrated episodes with human-in-the-loop approval, trust levels, and memory. The starter ships ONE no-op example (`welcome`) and an **empty registry** — this skill turns a responsibility idea into a shipped, reviewed PR.

**Announce at start:** "Using desk-patterns to plan and ship the `<key>` responsibility."

> Vocabulary (NON-NEGOTIABLE): **responsibility / episode / step**. An **agent** is the AI employee persona; a **responsibility** is one duty it owns. An **episode** is one run of a responsibility against one entity. A **step** is a discrete durable operation inside the episode. `COMING_SOON` is a real definition with `lifecycle: 'COMING_SOON'`, not a stub of missing code.

---

## 0. Read the canon first

- The **`backend-patterns`** skill §24 (Desk summary) — plus the full architecture below.
- `apps/backend/src/domains/desk/responsibilities/index.ts` — the registry, with the `welcome` example and the add-a-responsibility checklist in its doc comment.
- `apps/backend/src/domains/desk/responsibilities/definition.types.ts` — the `ResponsibilityDefinition` contract (the spec).

### Domain structure

```
domains/desk/
├── desk.module.ts
├── core/                                  ← generic Desk infrastructure (don't fork it)
│   ├── inngest/                           ← Inngest client (typed DeskEvents) + event controller
│   ├── episode/                           ← step writer, episode lifecycle
│   ├── approval/                          ← approval service + enrichment + decision webhook
│   ├── gate/                              ← gate.algorithm (pure decision logic)
│   ├── memory/                            ← memory store + reinforcer
│   ├── agent/                             ← agent registry
│   ├── responsibility/                    ← API + responsibility metadata
│   ├── scheduler/                         ← heartbeat → cron-due runs (tenant master switch)
│   ├── trigger/                           ← fan-out + domain-event bridge
│   ├── suppression/                       ← delivery suppression
│   └── types/                             ← enums, TrustLevel, TRUST_LEVEL_CONFIDENCE_THRESHOLDS
│
├── shared-steps/                          ← reusable step handlers
│   ├── gate.step.ts                       ← decision gating before every action
│   ├── execute.step.ts                    ← tool invocation via the pipeline
│   ├── close.step.ts                      ← episode closure + memory write
│   ├── _llm-step.helper.ts                ← runStructuredLlmStep() — structured LLM wrapper
│   ├── step.types.ts                      ← shared hydrate/preflight shapes
│   └── outcomes.ts                        ← DESK_OUTCOMES + TERMINAL_STATUS_BY_OUTCOME
│
└── responsibilities/                      ← one folder per responsibility (YOUR extension point)
    ├── definition.types.ts                ← ResponsibilityDefinition interface
    ├── index.ts                           ← RESPONSIBILITY_REGISTRY (code-authored)
    ├── coming-soon.ts                     ← COMING_SOON stubs (UI only)
    ├── desk-bootstrap.service.ts          ← seeds desk_responsibilities rows per tenant
    ├── desk-prompt.registrar.ts           ← prompt registration
    └── <your-key>/                        ← definition, steps/, workflow/, prompts/, adapters
```

### The step pipeline

Inngest orchestrates the workflow as durable steps. Typical flow:

1. **hydrate** — load the entity + conditions snapshot + relevant memories + preflight check (proceed/skip/abort). No LLM. Shapes from `shared-steps/step.types.ts`.
2. **perceive** (LLM) — classify the entity's state; emit confidence.
3. **decide** (LLM) — act, skip, or escalate; emit confidence.
4. **draft** (LLM or deterministic) — compose the proposed action; emit confidence.
5. **gate** (shared step) — conditions + trust level + confidence → approve or gated. The conditions evaluator is supplied per-responsibility; the gate stays job-blind.
6. **execute** (shared step) — run the MCP tool via the invocation pipeline (agent principal with responsibility-scoped permissions).
7. **close** (shared step) — set episode status/outcome, write memory, reinforce used memories, emit a domain event.

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
- **A domain service** — hydrate can resolve any service from the root Nest container (see §6 gotcha) and call it directly.

**Dispatch an Explore agent** to map the sensor: its exact output shape, freshness, the MCP tools that read it, and any gap. This research step pays for itself every time.

---

## 3. Plan via the `plan` skill

Invoke the **`plan`** skill with the responsibility brief + the research findings. The plan MUST:

- Name the reference responsibility (or the `welcome` example) to mirror file-for-file.
- Contain **complete code for the novel files** (schemas, fan-out, conditions-evaluator, definition) and **exact deltas + reference pointers** for the template-mirroring files (steps, workflow, adapters, registration).
- Flag every **verification read** (Prisma field names, tool param names, service signatures) the executor must do before writing.
- List the **registration touchpoints** (§5).
- Use the **task spine** in §4.

---

## 4. The task spine (every responsibility has these)

0. Worktree + baseline (off the CURRENT default-branch tip; `pnpm install`; `pnpm prisma:generate` + `pnpm --filter @app/shared-types build`; baseline desk suite green).
1. Schemas — the responsibility's conditions schema + conditions UI spec, perceive/decide/draft Zod output schemas (confidence = plain `z.number()` — structured-output providers can reject min/max constraints on numbers), outcomes.
   - **(1.5) If the act needs a new MCP tool** — build it first: the `@Tool` wrapper over the existing domain service, scope registration, `mcp-tools.module.ts` registration, spec.
2. Outcome vocabulary — add to `DESK_OUTCOMES` + `TERMINAL_STATUS_BY_OUTCOME` in `shared-steps/outcomes.ts` (or reuse an existing outcome).
3. Fan-out (TDD) — a pure tenant-scoped Prisma query returning the work items. Cheap; per-item enrichment happens in hydrate.
4. step.types + conditions-evaluator (TDD) + reinforcement-judge (TDD) — the judge is a decision table mapping memory polarity × closing transition → CONFIRM/CONTRADICT/NEUTRAL.
5. Prompts — perceive/decide/draft prompt files + `PROMPT_NAMES` entries (`domains/prompting/prompting.types.ts`) + registrar wiring (`desk-prompt.registrar.ts`).
6. Steps — hydrate (load entity + memory + preflight; resolve recipient/contact; **pin recipient/entity id**) + perceive(`fast`)/decide(`standard`)/draft(`standard`) via `runStructuredLlmStep()`.
7. Workflow + spec — the Inngest function covering all terminal paths (preflight abort/skip, no-action, gate→execute→close, approve/edited/reject/expired/retry-cap, auto-escalate). Add the typed `DeskEvents['app/desk.<key>.run']` entry in `core/inngest/inngest.client.ts`.
8. Approval adapter (TDD) — the decision-sheet payload (artifact, header, summary, context bullets, confidence) built from episode steps, so the approval UI renders it without responsibility-specific UI code.
9. Registration (§5).
10. Verification + PR.

TDD the pure units (fan-out, evaluator, judge, adapter, any new MCP tool) and the workflow spec. Target ≥90% on changed files. **Commit after every task** — interruptions must leave recoverable, green progress.

---

## 5. Registration touchpoints (the files every responsibility edits)

These are the additive, keep-both-on-conflict files. Edit all that apply:

1. `desk/responsibilities/<key>/definition.ts` (new) + `desk/responsibilities/index.ts` (registry array — order = UI card order).
2. `desk/responsibilities/coming-soon.ts` — remove the stub if promoting one.
3. `desk/shared-steps/outcomes.ts` — new outcome (if any).
4. `desk/core/inngest/inngest.controller.ts` — register the workflow function.
5. `desk/core/inngest/inngest.client.ts` — typed `DeskEvents['app/desk.<key>.run']` entry.
6. `desk/core/trigger/trigger.service.ts` — `run<Key>ForTenant` method + `runByKey` case + the fan-out import.
7. `desk/core/approval/approval-enrichment.service.ts` — the enrich() branch.
8. `desk/responsibilities/desk-prompt.registrar.ts` + `domains/prompting/prompting.types.ts` `PROMPT_NAMES`.
9. Shared types export if the schemas live in `@app/shared-types`.

> Because every responsibility touches the same registration files, **concurrent PRs conflict additively (keep-both)**. Ship one at a time, or note it in the PR and rebase keep-both.

---

## 6. Hard-won gotchas (don't relearn them)

- **Pin the recipient / entity id from hydrate, never from the LLM draft.** A SUPERVISED gate hides this today, but it becomes a live misroute the day trust flips to ASSISTED/AUTONOMOUS (the no-approval branch executes the args verbatim). The workflow spec should assert a hallucinated `draft.to`/name is ignored.
- **hydrate resolves domain services via the root Nest container** (see `core/inngest/nest-context.ts`) — this works WITHOUT importing that service's module into DeskModule, because the root `INestApplication` searches the whole DI graph for any exported provider.
- **Calendar dates** (`@db.Date`): never `new Date(dateOnlyString)` (off-by-one across timezones). Format the raw string or use a UTC-safe helper.
- **Desk steps run in Inngest workers, not HTTP** — throw plain `Error`, not NestJS exceptions. MCP tools return `{ error }`, never throw.
- **Auto-escalate terminal failures to a distinct close step** — Inngest memoizes completed steps, so reusing the same step id for the failure path can silently suppress human review.
- **Registry-shape specs** may hardcode the AVAILABLE-responsibility count or use a COMING_SOON key as a "no-evaluator" example — update those; it's an expected change, not a regression.
- **Bootstrap lifecycle flip:** existing tenants' rows go COMING_SOON → AVAILABLE via the bootstrap upsert; they stay `enabled: false` (operator must toggle the card on). No migration.
- **After ANY rebase, re-run `pnpm prisma:generate` + shared-types build** in the worktree — otherwise you chase phantom type errors from other merged PRs (a stale generated client looks exactly like a real failure).
- **Conditions gate BEFORE LLM cost.** The gate runs the evaluator on hydrate output; execute never re-checks conditions.
- **The gate is job-blind.** New responsibility = zero edits to `gate.step.ts`; the evaluator rides in on the definition.
- **Reinforcement is best-effort** — memory write/reinforce failures log and continue; they never block episode close. Episode status is the source of truth.
- **Memory entityRef is responsibility-owned** — each responsibility picks its scoping level (entity vs relationship); the close step copies the ref from hydrate without knowing the shape.
- **COMING_SOON degrades gracefully** — lifecycle skips prompt registration + tool provisioning; the orchestrator no-ops when the judge is absent.

---

## 7. Execute → review → fix → PR

1. **Execute** via the `execute` skill (or a background `Agent` per the plan if running several in parallel). Hand the executor the plan path + the §6 gotchas + the recovery rule (commit per task).
2. **Review** the resulting PR via the `review` skill (a fresh agent). Watch especially: tenant scoping on every query, recipient/id pinning, the act-tool contract match, sensor reconstruction correctness, and the Desk conventions above.
3. **Apply review fixes** (approve-with-fixes is the norm — the fixes are usually small). Push.
4. **PR body** states: the sensor→act wiring, the trigger cadence + the disabled-by-default note (automation off until enabled + armed + master switch), the merge-conflict note vs sibling open PRs, and test evidence.

---

## Red flags — STOP and fix

- The act is "decision-only" and you're about to ship `tools: []` for an automated duty without confirming the new-pattern risk with the user.
- Recipient/entity id sourced from the LLM draft instead of hydrate.
- `triggers` is `[{ kind: 'manual' }]` only for a duty that has a natural cadence — you stripped the domain trigger instead of leaving it disabled-by-default.
- A new domain enum/status hand-written instead of added to the Prisma schema (see `backend-patterns` §6.4).
- Trust thresholds inlined instead of imported from `TRUST_LEVEL_CONFIDENCE_THRESHOLDS`.
- Skipping the `plan` or `review` skills — this skill wraps them, it doesn't replace them.

## What NOT to do

- Don't re-implement a sensor inside a responsibility — ride the existing engine's output.
- Don't duplicate business logic — the act calls an existing domain service via an MCP tool.
- Don't hand-write gate/trust logic — it rides in via the definition's `conditionsEvaluator`; the gate stays job-blind.
- Don't use bare outcome strings — `DESK_OUTCOMES` constants only.
