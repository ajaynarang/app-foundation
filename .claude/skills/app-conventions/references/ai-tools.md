---
owner: foundation
status: interim
pending: F3
sources:
  - apps/backend/src/domains/ai/mcp/mcp-tools.module.ts
  - apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts
  - apps/backend/src/domains/ai/mcp/tools/tool-error.ts
  - apps/backend/src/domains/ai/agent-contract/invocation-pipeline.service.ts#InvocationPipelineService
  - apps/backend/src/domains/ai/agent-contract/tool-executor.service.ts#ToolExecutorService
  - apps/backend/src/domains/ai/agent-contract/intent-digest.ts#intentDigest
  - apps/backend/src/domains/ai/agent-contract/tool-idempotency.ts#idempotencyKeyArg
  - apps/backend/src/domains/ai/agent-contract/tool-input-schema.ts#toolInputSchema
  - apps/backend/src/domains/ai/agent-contract/tool-availability.service.ts#TOOL_AVAILABILITY_RULES
  - apps/backend/src/domains/ai/agent-contract/tool-policy.decorator.ts
  - apps/backend/src/domains/ai/assistant/prompts/prompt-registry.data.ts#PROMPT_LIBRARY
guards:
  - support-ticket.pipeline.spec.ts
  - mcp-arg-validation.spec.ts
  - mcp-tool.write-parity.spec.ts
  - tool-error.spec.ts
  - intent-digest.spec.ts
  - tool-idempotency.spec.ts
  - tool-input-schema.spec.ts
  - tool-availability.service.spec.ts
  - hitl-challenge.single-use.integration.spec.ts
  - pipeline.integration.spec.ts
  - agent-rate-limit.guard.spec.ts
  - prompt-registry.data.spec.ts
  - scope-coverage.spec.ts
examples:
  - projectNumber
---

# AI tools: the one pipeline, confirmations, chat grants, external agents, retry-safe creates, prompts

Moved from the old backend skill; condensed with its recipe in its finish pull request. The example pair is
`apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts`, and `support-ticket.pipeline.spec.ts` walks it through
every step: copy its shape for a new tool.

## Rules

### Keeping tools in step with the API

- When an endpoint for an entity the assistant can reach is added, changed or removed, its tools in
  `apps/backend/src/domains/ai/mcp/tools/` change in the same pull request: a new field in the read tool's output (and
  its filters), a new status in its enum, a new operation in the write tool, a removed one taken out.
  [review-only: no spec pairs routes with tools beyond role and plan]
- A tool is a `@Tool` provider registered in `mcp-tools.module.ts`, one read tool and one write tool per entity family;
  its module imports the domain module whose service it calls. [guard: scope-coverage.spec.ts]
- Identity is injected by the server: `_tenantId`, `_userId`, `_userDbId` and `_role` come from the executor, spread
  last. A tool schema declares no `_` field and no tenant or user field. [guard: mcp-arg-validation.spec.ts]
- Every query filters by tenant; a tool returns no numeric id and resolves records by their public identifier
  (`projectNumber`) before it calls a service. [guard: id-boundary.spec.ts]
- A tool throws the service's `HttpException` or lets it propagate; never `return { error: err.message }`. Anything
  that is not an `HttpException` is logged and answered with a generic message by `toolFailure` (`tool-error.ts`).
  [guard: mcp-arg-validation.spec.ts, tool-error.spec.ts]

### The pipeline

- Every tool call, from chat (`McpToolService`), the external MCP server (OAuth clients, API keys) and a background
  duty, runs through `InvocationPipelineService.run`, in order: scope, arguments (parsed by the tool's own zod schema;
  every `_` key the caller sent is dropped; a failure is `VALIDATION_FAILED` with `fieldErrors`), role, plan,
  confirmation, audit and execute, errors. [guard: pipeline.integration.spec.ts]
- No path around it: only `ToolExecutorService.invoke` calls a tool method. A chat call with no pipeline is refused
  (`tool_pipeline_unavailable`); there is no fallback and no anonymous toolset. [guard: pipeline.integration.spec.ts]
- Scope decides write versus read: a tool is a write when its `@RequiresScope` is not read tier. There is no
  hand-kept write list. [guard: scope-coverage.spec.ts]
- A tool whose REST twin has `@Roles(...)` declares `@RestrictToRoles([...])` with the same roles; the pipeline reads the
  acting person's current `WorkspaceMember` role in the principal's workspace, never a persona or the home tenant, and
  no membership is a refusal. [guard: mcp-tool.write-parity.spec.ts]
- A tool whose REST twin has `@RequireFeature(key)` declares `@RequiresPlanFeature(key)`; the pipeline runs the real
  `PlanGuard` against a synthetic request. Never copy the plan rule. Role and plan refusals are plain results
  (`role_not_permitted`, `not_on_plan`). [guard: mcp-tool.write-parity.spec.ts]
- Confirmation is deny by default: every principal but a signed-in user and a background duty gets a challenge token
  for a non-read tier. No tool or prompt carries a switch that skips confirmation. [guard: pipeline.integration.spec.ts]
- A confirmation is bound to the tool and `intentDigest(schema, args)`: top-level `_` keys dropped, parsed through the
  schema, canonical JSON with keys sorted at every depth, SHA-256. Every path that records or checks a confirmation
  calls that one function; never hash the redacted copy, never `JSON.stringify` with a key list.
  [guard: intent-digest.spec.ts]
- A token or grant is spent with a conditional update (`updateMany` where `consumedAt: null`, then check `count`), never
  a read then an `update`, so two racing retries cannot both run. [guard: hitl-challenge.single-use.integration.spec.ts]

### Chat grants and external agents

- A chat write runs only against the card the person confirmed for that exact call in that conversation:
  `confirm-action` names the write tool and its exact arguments; the server checks it (`pipeline.preflight`), records
  the intent (`HitlChallengeService.recordChatIntent`) and builds the card from the recorded tool and arguments, never
  from model prose. The pipeline spends a grant only for the same conversation, tool and digest (`consumeChatGrant`). A
  new user message voids every open card; a delegated sub-agent gets a read-only toolset. [guard:
  chat-confirmation.integration.spec.ts]
- A third-party agent's standard write is issued as an approval request (`approval_required` with `approvalUrl`) and
  runs only after a person approves it and the agent replays the token. `Tenant.agentSelfConfirm` switches standard
  writes back to self-confirm. A sensitive write always needs the PIN of the person acted for. `argsPreview` may hold
  personal data: never logged, never in an event, nulled when spent or denied. The approval routes take a person's
  session, never an agent credential. [guard: agent-actions.integration.spec.ts]
- Agent rate limits (`AgentRateLimitGuard`): an OAuth client's budget is per client and person; OAuth clients and API
  keys also share one per-workspace ceiling (`AGENT_TENANT_CEILING_PER_MINUTE`, default 600).
  [guard: agent-rate-limit.guard.spec.ts]

### Retry-safe creates and schemas

- A create tool with no natural key declares `idempotencyKey: idempotencyKeyArg` in its parameters and is listed in
  `IDEMPOTENT_CREATE_TOOLS` (`tool-idempotency.spec.ts`); a `create-*` write on neither that list nor
  `NATURAL_KEY_CREATES` fails. The executor uses the same `IdempotencyStore` as the `Idempotency-Key` header. Never a
  second store, a hand-rolled dedupe, or the key on a read. [guard: tool-idempotency.spec.ts]
- `tools/list` serves `toolInputSchema(parameters)`: `_` properties stripped, `_confirmToken` documented. Never build a
  tool's input schema another way. [guard: tool-input-schema.spec.ts]
- Availability hides, it never permits: a tool whose channel may be unconfigured gets a rule in
  `TOOL_AVAILABILITY_RULES` and is left out of `tools/list`, every chat toolset and `confirm-action`. Who may run a tool
  is scope, role and plan. [guard: tool-availability.service.spec.ts]
- Curated prompts live in `PROMPT_LIBRARY` (`assistant/prompts/prompt-registry.data.ts`, empty in the starter), served by
  `prompts/list` and `prompts/get` filtered by the acting person's role. A prompt is a suggestion, never a permission.
  [guard: prompt-registry.data.spec.ts]

## Flag in review

- A tool method called outside `ToolExecutorService.invoke`.
- A write tool whose role or plan does not match its REST twin.
- A `_`-prefixed field in a tool schema; a numeric id in a tool's output.
- `return { error: err.message }` in a tool.
- A confirmation hashed any way but `intentDigest`; a token spent with a read then an update.
- A create tool with no natural key and no idempotency key.
