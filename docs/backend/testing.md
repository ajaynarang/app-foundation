---
title: Testing
description: Jest config, the constructor-injection mocking pattern, where specs live, the four intentional skips, TDD discipline.
---

# Testing

Backend uses Jest with TDD. Web does not currently have working unit tests (see [Frontend Guide](../frontend/index.md)). Cross-cutting tests (API workflows, browser, RBAC, smoke) live in the `tests/` workspace and use Playwright — see [Quality Gate](../qa/index.md).

## Config

Jest config lives in `apps/backend/package.json` under the `jest` key. Verified contents:

- **`testRegex`:** `.*\\.spec\\.ts$` — spec files are named `*.spec.ts`.
- **`roots`:** `<rootDir>/src` and `<rootDir>/scripts` — both are scanned for specs.
- **`testEnvironment`:** `node`.
- **`transform`:** `ts-jest` with `diagnostics: false`, `isolatedModules: true`. Fast TypeScript compile; type checks happen via the separate `pnpm type-check` task.
- **Coverage collection:** `src/**/*.(t|j)s` plus `scripts/tenant-reset/**` (minus the CLI entrypoints).

## Intentional skips

`testPathIgnorePatterns` excludes four specific paths. These are documented exclusions, not bugs — don't "fix" them without checking why:

| Path | Why excluded |
|---|---|
| `*.schema.spec.ts` | Schema validation tests aren't currently runnable in this Jest config |
| `sally-ai.service.spec.ts` | Needs LLM provider config that's not available in CI |
| `langfuse-prompt.service.spec.ts` | Needs Langfuse-style config not available in CI |
| `desk/engine/__tests__/invocation.service.spec.ts` | Needs Mastra runtime config not available in CI |

If you add a spec that genuinely can't run in CI, add it to the skip list with a comment explaining why.

## Where specs live

Two patterns are both fine:

- **Co-located:** `apps/backend/src/domains/fleet/loads/services/loads.service.spec.ts` next to `loads.service.ts`.
- **Under `__tests__/`:** `apps/backend/src/domains/desk/core/agent/__tests__/agent.service.spec.ts`.

Either works. The codebase has both. Match the surrounding pattern in the folder you're working in.

## The mocking pattern

The codebase favors **constructor injection + hand-rolled fakes**, not `Test.createTestingModule({...}).compile()` with provider overrides. The fakes are tiny classes that satisfy the surface area the test exercises:

```ts
// apps/backend/src/domains/desk/core/agent/__tests__/agent.service.spec.ts
class FakePrismaService {
  deskAgent = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
}

describe('AgentService', () => {
  let service: AgentService;
  let prisma: FakePrismaService;

  beforeEach(() => {
    prisma = new FakePrismaService();
    service = new AgentService(prisma as any);
  });

  it('updates an enabled flag', async () => {
    prisma.deskAgent.findUnique.mockResolvedValue({
      id: 1,
      tenant_db_id: 1,
      agent_key: 'sally-billing',
      enabled: false,
    });
    prisma.deskAgent.update.mockResolvedValue({ enabled: true });

    const res = await service.updateAgent(1, 'sally-billing', { enabled: true });

    expect(prisma.deskAgent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenant_db_id_agent_key: { tenant_db_id: 1, agent_key: 'sally-billing' } },
        data: { enabled: true },
      }),
    );
    expect(res).toEqual({ enabled: true });
  });
});
```

Why not the NestJS `Test.createTestingModule` pattern? Two reasons:

1. **Speed** — instantiating a fake class is faster than building a TestingModule, especially when you do it once per test.
2. **Clarity** — the fake only has the methods the test exercises. The reader sees exactly what the service depends on.

There are cases where TestingModule is the right tool (testing how a module wires up providers, for example), but for service unit tests the fake-class pattern is the norm.

## Mocking Prisma

The pattern above (a `FakePrismaService` class with jest-mocked methods) is the most common approach. You don't need a separate Prisma mock library. For tests that need many Prisma models, factor the fake into a helper:

```ts
function makePrismaFake() {
  return {
    deskAgent: { findUnique: jest.fn(), update: jest.fn() },
    deskEpisode: { findMany: jest.fn(), count: jest.fn() },
    $transaction: jest.fn((cb) => cb(/* nested fake */)),
  };
}
```

For tests that genuinely need a real database (rare — these are integration tests, not unit tests), use the `tests/` workspace + Playwright API tests instead.

## Mocking events

`EventEmitter2` is straightforward to mock:

```ts
class FakeEventBus {
  emit = jest.fn();
}
```

Assert against the emitted `DomainEvent`:

```ts
expect(events.emit).toHaveBeenCalledWith(
  expect.objectContaining({
    event: 'load.dispatched',
    tenantId: '42',
    data: { loadId: 'load-1', driverId: 'driver-1' },
  }),
);
```

Use `objectContaining` so the test doesn't break when you add fields to the event payload later.

## Running tests

```bash
pnpm backend:test                                       # all backend Jest specs
cd apps/backend && pnpm test                            # same
cd apps/backend && pnpm test -- --testPathPattern loads  # filter by path
cd apps/backend && pnpm test -- --watch                 # watch mode
cd apps/backend && pnpm test:cov                        # with coverage report → apps/backend/coverage/
cd apps/backend && pnpm test:debug                      # node --inspect-brk
```

## Coverage targets

There isn't a hard threshold enforced in CI for backend coverage. Aim for:

- Services: >= 80% line coverage.
- Controllers: at least one spec covering each method's happy path.
- Pure helpers (`utils/`): high coverage, easy to write.

The QA suite (`tests/api/`) covers integration scenarios — your unit tests don't need to cover the full request lifecycle.

## TDD discipline

Per `CLAUDE.md`, backend uses TDD. The flow:

1. Write the failing spec.
2. Run it. Confirm it fails for the right reason.
3. Write the minimum implementation to pass.
4. Refactor.

If you find yourself "writing the test after," you're often missing edge cases. Watch the spec fail first.

## Anti-patterns

- **Snapshot tests for service behavior.** Hard to read, easy to accept-by-default. Prefer explicit assertions.
- **`@nestjs/testing` for unit tests where you only need one service.** Use the fake-class pattern — it's clearer.
- **Mocking `PrismaService` globally.** Each test class instantiates its own fake — global mocks bleed across files.
- **Disabling `isolatedModules` because of a type error.** Fix the type error.
