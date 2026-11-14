---
owner: foundation
requires: desk
sources:
  - apps/backend/src/domains/desk/responsibilities/index.ts
  - apps/backend/src/domains/desk/responsibilities/definition.types.ts
  - apps/backend/src/domains/desk/shared-steps/outcomes.ts#DESK_OUTCOMES
  - apps/backend/src/domains/desk/shared-steps/_llm-step.helper.ts#runStructuredLlmStep
  - apps/backend/src/domains/desk/core/types/enums.ts#TRUST_LEVEL_CONFIDENCE_THRESHOLDS
---

# Building a Desk responsibility: the folder, the task spine, the touchpoints, the gotchas

Read with the `app-desk` skill: it says what to decide before planning; this says what the plan and the executor
must cover.

## Domain structure

The folder `apps/backend/src/domains/desk/`, as the starter ships it:

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

## The task spine (every responsibility has these)

0. Worktree + baseline (off the CURRENT default-branch tip; `pnpm install`; `pnpm backend:prisma:generate` + `pnpm --filter @app/shared-types build`; baseline desk suite green).
1. Schemas — the responsibility's conditions schema + conditions UI spec, perceive/decide/draft Zod output schemas (confidence = plain `z.number()` — structured-output providers can reject min/max constraints on numbers), outcomes.
   - **(1.5) If the act needs a new MCP tool** — build it first: the `@Tool` wrapper over the existing domain service, scope registration, `mcp-tools.module.ts` registration, spec.
2. Outcome vocabulary — add to `DESK_OUTCOMES` + `TERMINAL_STATUS_BY_OUTCOME` in `shared-steps/outcomes.ts` (or reuse an existing outcome).
3. Fan-out (TDD) — a pure tenant-scoped Prisma query returning the work items. Cheap; per-item enrichment happens in hydrate.
4. step.types + conditions-evaluator (TDD) + reinforcement-judge (TDD) — the judge is a decision table mapping memory polarity × closing transition → CONFIRM/CONTRADICT/NEUTRAL.
5. Prompts — perceive/decide/draft prompt files + `PROMPT_NAMES` entries (`domains/prompting/prompting.types.ts`) + registrar wiring (`desk-prompt.registrar.ts`).
6. Steps — hydrate (load entity + memory + preflight; resolve recipient/contact; **pin recipient/entity id**) + perceive(`fast`)/decide(`standard`)/draft(`standard`) via `runStructuredLlmStep()`.
7. Workflow + spec — the Inngest function covering all terminal paths (preflight abort/skip, no-action, gate→execute→close, approve/edited/reject/expired/retry-cap, auto-escalate). Add the typed `DeskEvents['app/desk.<key>.run']` entry in `core/inngest/inngest.client.ts`.
8. Approval adapter (TDD) — the decision-sheet payload (artifact, header, summary, context bullets, confidence) built from episode steps, so the approval UI renders it without responsibility-specific UI code.
9. Registration (the touchpoints below).
10. Verification + PR.

TDD the pure units (fan-out, evaluator, judge, adapter, any new MCP tool) and the workflow spec. Target ≥90% on changed files. **Commit after every task** — interruptions must leave recoverable, green progress.

---

## Registration touchpoints (the files every responsibility edits)

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

## Hard-won gotchas (don't relearn them)

- **Pin the recipient / entity id from hydrate, never from the LLM draft.** A SUPERVISED gate hides this today, but it becomes a live misroute the day trust flips to ASSISTED/AUTONOMOUS (the no-approval branch executes the args verbatim). The workflow spec should assert a hallucinated `draft.to`/name is ignored.
- **hydrate resolves domain services via the root Nest container** (see `core/inngest/nest-context.ts`) — this works WITHOUT importing that service's module into DeskModule, because the root `INestApplication` searches the whole DI graph for any exported provider.
- **After adding a responsibility key, outcome or event, run `pnpm build`.** An exhaustive `Record<Key, …>` over a key union (`Record<TrustLevel, …>` in `core/types/enums.ts` is one; a responsibility often adds its own), a typed `DeskEvents` payload and the `ResponsibilityDefinition` contract are checked only by the compiler. Jest will not catch a missing entry or a wrong shape: ts-jest runs with `diagnostics: false` and `isolatedModules: true` (`apps/backend/package.json`), so specs pass while the map is incomplete. Only the build type-checks it.
- **Calendar dates** (`@db.Date`): never `new Date(dateOnlyString)` (off-by-one across timezones). Format the raw string or use a UTC-safe helper.
- **Desk steps run in Inngest workers, not HTTP** — throw plain `Error`, not NestJS exceptions. MCP tools return `{ error }`, never throw.
- **Auto-escalate terminal failures to a distinct close step** — Inngest memoizes completed steps, so reusing the same step id for the failure path can silently suppress human review.
- **Registry-shape specs** may hardcode the AVAILABLE-responsibility count or use a COMING_SOON key as a "no-evaluator" example — update those; it's an expected change, not a regression.
- **Bootstrap lifecycle flip:** existing tenants' rows go COMING_SOON → AVAILABLE via the bootstrap upsert; they stay `enabled: false` (operator must toggle the card on). No migration.
- **After ANY rebase, re-run `pnpm backend:prisma:generate` + shared-types build** in the worktree — otherwise you chase phantom type errors from other merged PRs (a stale generated client looks exactly like a real failure).
- **Conditions gate BEFORE LLM cost.** The gate runs the evaluator on hydrate output; execute never re-checks conditions.
- **The gate is job-blind.** New responsibility = zero edits to `gate.step.ts`; the evaluator rides in on the definition.
- **Reinforcement is best-effort** — memory write/reinforce failures log and continue; they never block episode close. Episode status is the source of truth.
- **Memory entityRef is responsibility-owned** — each responsibility picks its scoping level (entity vs relationship); the close step copies the ref from hydrate without knowing the shape.
- **COMING_SOON degrades gracefully** — lifecycle skips prompt registration + tool provisioning; the orchestrator no-ops when the judge is absent.

---
