---
owner: foundation
sources:
  - apps/backend/src/domains/ai/mcp/mcp-tools.module.ts#McpToolsModule
  - apps/backend/src/domains/ai/mcp/mcp-tool.service.ts#TOOL_PIPELINE_UNAVAILABLE
  - apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts#SupportTicketTool
  - apps/backend/src/domains/ai/mcp/tools/tool-error.ts#toolFailure
  - apps/backend/src/domains/ai/agent-contract/invocation-pipeline.service.ts#InvocationPipelineService
  - apps/backend/src/domains/ai/agent-contract/tool-executor.service.ts#ToolExecutorService
  - apps/backend/src/domains/ai/agent-contract/tool-names.constants.ts#ToolNames
  - apps/backend/src/domains/ai/agent-contract/requires-scope.decorator.ts#RequiresScope
  - apps/backend/src/domains/ai/agent-contract/tool-policy.decorator.ts#RestrictToRoles
  - apps/backend/src/domains/ai/agent-contract/tool-policy.decorator.ts#RequiresPlanFeature
  - apps/backend/src/domains/ai/agent-contract/scope-registry.constants.ts#SCOPE_IMPLICATIONS
  - apps/backend/src/domains/ai/agent-contract/intent-digest.ts#intentDigest
  - apps/backend/src/domains/ai/agent-contract/hitl-challenge.service.ts#recordChatIntent
  - apps/backend/src/domains/ai/agent-contract/tool-idempotency.ts#idempotencyKeyArg
  - apps/backend/src/domains/ai/agent-contract/tool-input-schema.ts#toolInputSchema
  - apps/backend/src/domains/ai/agent-contract/tool-availability.service.ts#TOOL_AVAILABILITY_RULES
  - apps/backend/src/domains/ai/agent-contract/agent-rate-limit.constants.ts#AGENT_RATE_LIMIT_DEFAULTS
  - apps/backend/src/domains/ai/assistant/prompts/prompt-registry.data.ts#PROMPT_LIBRARY
  - packages/shared-types/src/ai/agent-scopes.schema.ts#AgentScopeSchema
guards:
  - ai-tool-path.spec.ts
  - support-ticket.pipeline.spec.ts
  - invocation-pipeline.service.spec.ts
  - mcp-tool.service.pipeline.spec.ts
  - mcp-arg-validation.spec.ts
  - mcp-tool.write-parity.spec.ts
  - scope-coverage.spec.ts
  - tool-names-registry.spec.ts
  - tool-policy.decorator.spec.ts
  - feature-key-coverage.spec.ts
  - tool-executor.service.spec.ts
  - tool-error.spec.ts
  - id-boundary.spec.ts
  - intent-digest.spec.ts
  - hitl-challenge.single-use.integration.spec.ts
  - chat-confirmation.integration.spec.ts
  - agent-actions.integration.spec.ts
  - agent-rate-limit.guard.spec.ts
  - rate-limit.service.spec.ts
  - tool-idempotency.spec.ts
  - tool-input-schema.spec.ts
  - tool-availability.service.spec.ts
  - prompt-registry.data.spec.ts
  - mcp-server.service.spec.ts
examples:
  - LIST_WIDGETS
  - CREATE_WIDGET
  - widgetNumber
  - FEATURE_KEYS.WIDGETS
---

# AI tools: the one pipeline, confirmations, chat grants, external agents, retry-safe creates, prompts

A tool is how the assistant, an external MCP client (an OAuth client or an API key) and a background duty act on the
product. Every call runs through one pipeline, so a tool is no wider than the REST route it mirrors. The example pair
is `apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts`; `support-ticket.pipeline.spec.ts` walks it through
every step. Model calls are in [`ai.md`](ai.md), routes and keys in [`ai-routing.md`](ai-routing.md).

The pipeline, in order (`InvocationPipelineService.run`):

| Step            | What it checks                                                                                       | A refusal                          |
| --------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 1. Scope        | The tool exists; the principal holds its `@RequiresScope` (with `SCOPE_IMPLICATIONS`)                | `scope_denied`                     |
| 2. Arguments    | The tool's own zod schema; every `_` key the caller sent is dropped first                            | `VALIDATION_FAILED`, `fieldErrors` |
| 3. Role         | The acting person's current `WorkspaceMember` role against `@RestrictToRoles`; no membership refuses | `role_not_permitted`               |
| 4. Plan         | `@RequiresPlanFeature`, judged by the real `PlanGuard`                                               | `not_on_plan`                      |
| 5. Confirmation | Any tier above read: a chat grant, an approved challenge, or a PIN                                   | `confirmation_required`, ...       |
| 6. Audit, run   | An audit row, then `ToolExecutorService` runs the method with the server's identity                  |                                    |
| 7. Errors       | An `HttpException` passes its message and code; anything else is logged and answered generically     | `toolFailure`                      |

## Rules

### The tool

- A tool is a `@Tool` method on a provider registered in `mcp-tools.module.ts`, whose module imports the domain module
  whose service it calls. Its name is a `ToolNames` entry (`tool-names.constants.ts`), used in the decorator.
  [guard: mcp-tool.write-parity.spec.ts, tool-names-registry.spec.ts]
- Every `@Tool` method has `@RequiresScope`. Scope decides write versus read: a tool is a write when its scope is not
  read tier. There is no hand-kept write list. [guard: scope-coverage.spec.ts, mcp-tool.write-parity.spec.ts]
- One read tool and one write tool per entity family, each calling the domain service, never Prisma.
  [review-only: needs reading]
- Identity comes from the server: `_tenantId`, `_userId`, `_userDbId` and `_role` are injected by the executor,
  spread last so a caller's copy never wins. A tool schema declares no `_` field and no tenant or user field.
  [guard: mcp-arg-validation.spec.ts, tool-executor.service.spec.ts]
- A tool's parameters take a record's public identifier (`ticketNumber`, a `publicId`), never a numeric id.
  [guard: id-boundary.spec.ts]
- A tool's output carries the public identifier, never the `Int` key, and every query it makes filters by tenant.
  [review-only: no spec reads tool outputs]
- A tool throws the service's `HttpException` or lets it propagate; never `return { error: err.message }`. Anything
  that is not an `HttpException` is logged and answered with a generic message by `toolFailure`.
  [guard: mcp-arg-validation.spec.ts, tool-error.spec.ts]
- When an endpoint for an entity the assistant can reach is added, changed or removed, its tools change in the same
  pull request: a new field in the read tool's output and filters, a new status in its enum, a new operation in the
  write tool, a removed one taken out. [review-only: no spec pairs routes with tools]

### The pipeline

- Every tool call runs through `InvocationPipelineService.run`, in the order of the table above.
  [guard: support-ticket.pipeline.spec.ts, invocation-pipeline.service.spec.ts]
- No path around it: only the pipeline reaches `ToolExecutorService`, and only `mcp-tools.module.ts` imports a tool
  class. A chat call with no pipeline is refused (`tool_pipeline_unavailable`); there is no fallback and no anonymous
  toolset. [guard: ai-tool-path.spec.ts, mcp-tool.service.pipeline.spec.ts]
- A tool whose REST twin has `@Roles(...)` declares `@RestrictToRoles([...])` with the same roles, and one whose twin
  has `@RequireFeature(key)` declares `@RequiresPlanFeature(key)`. Never copy the plan rule into the tool.
  [review-only: no spec pairs a tool with its REST twin; `tool-policy.decorator.spec.ts` refuses an empty role list
  and an unknown feature key]
- The role step reads the acting person's current role in the principal's workspace, never a persona or the token; a
  chat persona's scopes are capped at that role's. Role and plan refusals are plain results the model relays, and they
  run before any confirmation, so nobody confirms what they cannot do. [guard: invocation-pipeline.service.spec.ts]
- A feature key named in `@RequiresPlanFeature` is a real plan feature with an entitlement row on every plan.
  [guard: feature-key-coverage.spec.ts]

### Confirmation

- Deny by default: every principal but a signed-in user (who spends a chat grant) and a background duty (gated by its
  own engine) is challenged for a tier above read. No tool or prompt carries a switch that skips confirmation.
  [guard: invocation-pipeline.service.spec.ts, mcp-tool.write-parity.spec.ts]
- A confirmation is bound to the tool and `intentDigest(schema, args)`: top-level `_` keys dropped, parsed through the
  schema, canonical JSON with keys sorted at every depth, SHA-256. Every path that records or checks a confirmation
  calls that one function; never hash the redacted copy, never `JSON.stringify` with a key list.
  [guard: intent-digest.spec.ts]
- A token or grant is spent with a conditional update (`updateMany` where `consumedAt: null`, then check `count`),
  never a read then an `update`, so two racing retries cannot both run.
  [guard: hitl-challenge.single-use.integration.spec.ts]
- A chat write runs only against the card the person confirmed for that exact call in that conversation:
  `confirm-action` names the write tool and its exact arguments; the server checks it (`preflight`, steps 1 to 4),
  records the intent (`recordChatIntent`) and builds the card from the recorded tool and arguments, never from model
  prose. The pipeline spends a grant only for the same conversation, tool and digest (`consumeChatGrant`). A new user
  message voids every open card; a delegated sub-agent gets read tools only.
  [guard: chat-confirmation.integration.spec.ts]
- A third-party agent's standard write is issued as an approval request (`approval_required` with `approvalUrl`) and
  runs only after a person approves it and the agent replays the token. `Tenant.agentSelfConfirm` switches standard
  writes back to echo-the-token. A sensitive write always needs the PIN of the person acted for. `argsPreview` may hold
  personal data: never logged, never in an event, nulled when spent or denied. The approval routes take a person's
  session, never an agent credential. [guard: agent-actions.integration.spec.ts]

### Rate limits, retries, listing, prompts

- Agent rate limits (`AgentRateLimitGuard`), per minute: defaults per principal kind in `AGENT_RATE_LIMIT_DEFAULTS`
  (an API key may carry its own); an OAuth client's budget is per client and person; OAuth clients and API keys also
  share one per-workspace ceiling (`AGENT_TENANT_CEILING_PER_MINUTE`, default 600). A refusal is 429 with
  `Retry-After`. [guard: agent-rate-limit.guard.spec.ts, rate-limit.service.spec.ts]
- A create tool with no natural key declares `idempotencyKey: idempotencyKeyArg` and is listed in
  `IDEMPOTENT_CREATE_TOOLS` (`tool-idempotency.spec.ts`); a `create-*` write on neither that list nor
  `NATURAL_KEY_CREATES` fails. The executor uses the same `IdempotencyStore` as the `Idempotency-Key` header and takes
  the key out before the method runs. Never a second store, a hand-rolled dedupe, or the key on a read.
  [guard: tool-idempotency.spec.ts, tool-executor.service.spec.ts]
- `tools/list` serves `toolInputSchema(parameters)`: `_` properties stripped, `_confirmToken` documented. Never build a
  tool's input schema another way. [guard: tool-input-schema.spec.ts]
- Availability hides, it never permits: a tool whose channel may be unconfigured gets a rule in
  `TOOL_AVAILABILITY_RULES` and is left out of `tools/list`, every chat toolset and `confirm-action`. Who may run a
  tool is scope, role and plan. [guard: tool-availability.service.spec.ts]
- Curated prompts live in `PROMPT_LIBRARY` (`assistant/prompts/prompt-registry.data.ts`, empty in the starter), served
  by `prompts/list` and `prompts/get` for the acting person's current role (`ToolAccessPolicyService.actingRole`),
  never the token's. A prompt is a suggestion, never a permission. [guard: prompt-registry.data.spec.ts,
  mcp-server.service.spec.ts]

## Recipe: add a read tool and a write tool

Copied from `apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts` with the entity renamed; the parts that
are the same for every tool are kept. Say the entity is a widget, with a `WidgetsService` in its own domain module.

1. Names, in `apps/backend/src/domains/ai/agent-contract/tool-names.constants.ts`: `LIST_WIDGETS: 'list-widgets'` and
   `CREATE_WIDGET: 'create-widget'`.
2. The provider, in `apps/backend/src/domains/ai/mcp/tools/<entity>.tool.ts`:

```typescript
// apps/backend/src/domains/ai/mcp/tools/support-ticket.tool.ts, renamed
interface ServerArgs {
  _tenantId: number;
  _userDbId: number;
}

@Injectable()
export class WidgetTool {
  constructor(private readonly widgets: WidgetsService) {}

  @RequiresScope('platform:read')
  @Tool({
    name: ToolNames.LIST_WIDGETS,
    description: "List this workspace's widgets, newest first. Use it when the user asks about their widgets.",
    parameters: z.object({
      limit: z.number().int().min(1).max(50).default(10).describe('How many widgets to return'),
      cursor: z.string().optional().describe('The nextCursor of a previous page'),
    }),
    annotations: { readOnlyHint: true, idempotentHint: true },
  })
  async listWidgets(params: { limit: number; cursor?: string } & ServerArgs) {
    const page = await this.widgets.listForTenant(params._tenantId, { limit: params.limit, cursor: params.cursor });
    return { widgets: page.items.map(WIDGET_SUMMARY), nextCursor: page.nextCursor, total: page.total };
  }

  @RequiresScope('platform:write')
  @RestrictToRoles([UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER]) // the roles of POST /widgets
  @RequiresPlanFeature(FEATURE_KEYS.WIDGETS) // only if POST /widgets has @RequireFeature
  @Tool({
    name: ToolNames.CREATE_WIDGET,
    description: 'Create a widget for this workspace. Confirm the name with the user first. Returns its number.',
    parameters: z.object({
      name: z.string().trim().min(1).max(200).describe('What to call it'),
      idempotencyKey: idempotencyKeyArg, // a create with no natural key
    }),
    annotations: { readOnlyHint: false, idempotentHint: false },
  })
  async createWidget(params: { name: string } & ServerArgs) {
    const widget = await this.widgets.create(params._tenantId, params._userDbId, { name: params.name });
    return { created: true, widget: WIDGET_SUMMARY(widget) }; // public identifier only, e.g. widgetNumber
  }
}
```

3. Register it: `WidgetTool` in `providers` and the widgets module in `imports` of `mcp-tools.module.ts`.
4. The list: add `ToolNames.CREATE_WIDGET` to `IDEMPOTENT_CREATE_TOOLS` in `tool-idempotency.spec.ts`.
5. A pipeline spec beside `support-ticket.pipeline.spec.ts` when the tool has a rule of its own (a plan gate, a
   sensitive scope). The guards above already cover every tool on disk: scope, schema, identity fields, registration,
   names, idempotency and the generic error.

The write gets confirmation for free: chat offers `confirm-action` for it, an external agent is challenged, and MCP
clients see it as not read-only. A sensitive write takes a `:sensitive` scope (`platform:write:sensitive`), which
always needs the PIN.

## Flag in review

- A tool method reached outside the pipeline; a tool class imported anywhere but `mcp-tools.module.ts`.
- A write tool whose roles or plan feature do not match its REST twin.
- A `_`-prefixed, tenant or user field in a tool schema; a numeric id in a tool's parameters or output.
- `return { error: err.message }` in a tool.
- A confirmation hashed any way but `intentDigest`; a token spent with a read then an update.
- A create tool with no natural key and no idempotency key.
- A tool listed or offered without passing `ToolAvailabilityService`, or an availability rule used as a permission;
  a prompt served by a role from the token instead of `ToolAccessPolicyService.actingRole`.
- An endpoint change with no matching change to its tools.
