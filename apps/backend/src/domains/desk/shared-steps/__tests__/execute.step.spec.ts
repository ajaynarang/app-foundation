import { DeskEpisodeStepKind } from '@appshore/db';

// nestApp() needs a live Nest container; replace it with a fake that
// returns our per-test service mocks.
const nestGet = jest.fn();
jest.mock('../../core/inngest/nest-context', () => ({
  nestApp: () => ({ get: nestGet }),
}));

// fromDeskResponsibility validates DB ids and builds the principal; we
// spy on it to assert the scope set derived from the responsibility's
// tool inventory.
jest.mock('@appshore/platform/auth/agent-principal', () => ({
  fromDeskResponsibility: jest.fn(() => ({ kind: 'desk_responsibility' })),
}));

import { fromDeskResponsibility } from '@appshore/platform/auth/agent-principal';
import { InvocationPipelineService } from '../../../ai/agent-contract/invocation-pipeline.service';
import { ScopeRegistryService } from '../../../ai/agent-contract/scope-registry.service';
import { DeskStepWriter } from '../../core/episode/desk-step-writer.service';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { findResponsibilityDefinition } from '../../responsibilities';
import { executeStep } from '../execute.step';

// The starter ships ONE generic responsibility ('welcome') with empty tools.
// These tests exercise the engine's scope-derivation + fail-closed paths
// against it. Add tools to your own responsibilities and assert their derived
// scope set the same way.
const WELCOME = findResponsibilityDefinition('welcome');

const fromDeskResponsibilityMock = fromDeskResponsibility as jest.MockedFunction<typeof fromDeskResponsibility>;

const EPISODE_ID = 'e1';

type EpisodeRow = {
  tenantId: number;
  responsibilityId: number;
  responsibility: { key: string };
  ownerAgent: { supervisorUserId: number | null };
};

function makeEpisode(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    tenantId: 10,
    responsibilityId: 5,
    responsibility: { key: 'welcome' },
    ownerAgent: { supervisorUserId: 99 },
    ...overrides,
  };
}

function setup(episode: EpisodeRow) {
  const prisma = {
    deskEpisode: { findUniqueOrThrow: jest.fn().mockResolvedValue(episode) },
  };
  const pipeline = {
    run: jest.fn().mockResolvedValue({ isError: false, content: [{ type: 'text', text: 'ok' }] }),
  };
  // Map known tools to deterministic scopes; unmapped tools return undefined
  // (registry miss) and are filtered out of the principal scope set.
  const scopeRegistry = {
    scopeForTool: jest.fn((tool: string) => {
      const map: Record<string, string> = {
        'send-email': 'comms:send',
        'read-document': 'documents:read',
        'write-record': 'platform:write',
      };
      return map[tool];
    }),
  };
  const stepWriter = {
    open: jest.fn().mockResolvedValue({ id: 'step-1' }),
    succeeded: jest.fn().mockResolvedValue(undefined),
    failed: jest.fn().mockResolvedValue(undefined),
  };

  nestGet.mockImplementation((token: unknown) => {
    if (token === PrismaService) return prisma;
    if (token === InvocationPipelineService) return pipeline;
    if (token === ScopeRegistryService) return scopeRegistry;
    if (token === DeskStepWriter) return stepWriter;
    throw new Error('unexpected DI token requested in executeStep test');
  });

  return { prisma, pipeline, scopeRegistry, stepWriter };
}

describe('executeStep — registry-driven scope set', () => {
  beforeEach(() => {
    nestGet.mockReset();
    fromDeskResponsibilityMock.mockClear().mockReturnValue({ kind: 'desk_responsibility' } as never);
  });

  it('derives the principal scope set from the responsibility definition tools', async () => {
    const { stepWriter } = setup(makeEpisode());

    await executeStep({ episodeId: EPISODE_ID, tool: 'send-email', args: { to: 'x@y.com' } });

    expect(fromDeskResponsibilityMock).toHaveBeenCalledTimes(1);
    const principalArg = fromDeskResponsibilityMock.mock.calls[0][0];
    // The starter 'welcome' responsibility declares no tools, so the principal
    // carries an empty scope set — the executed tool's own scope still gates the
    // step row, but the principal is minimally scoped to what the responsibility
    // declared (nothing).
    expect([...principalArg.scopes]).toEqual([]);
    expect(principalArg.responsibilityId).toBe(5);
    expect(principalArg.tenantId).toBe(10);
    expect(principalArg.enabledByUserId).toBe(99);
    expect(stepWriter.succeeded).toHaveBeenCalledTimes(1);
  });

  it('uses the responsibility definition tools as the inventory (no hardcoded list)', async () => {
    const { scopeRegistry } = setup(makeEpisode());

    await executeStep({ episodeId: EPISODE_ID, tool: 'send-email', args: {} });

    // Every tool in the definition is looked up to build the scope set.
    // 'welcome' has no tools, so only the executed tool itself is looked up.
    for (const tool of WELCOME.tools) {
      expect(scopeRegistry.scopeForTool).toHaveBeenCalledWith(tool);
    }
    expect(scopeRegistry.scopeForTool).toHaveBeenCalledWith('send-email');
  });
});

describe('executeStep — fail-closed paths', () => {
  beforeEach(() => {
    nestGet.mockReset();
    fromDeskResponsibilityMock.mockClear().mockReturnValue({ kind: 'desk_responsibility' } as never);
  });

  it('fails closed when the responsibility key has no registry definition', async () => {
    const { stepWriter, pipeline } = setup(makeEpisode({ responsibility: { key: 'not_a_real_key' } }));

    await expect(executeStep({ episodeId: EPISODE_ID, tool: 'send-email', args: {} })).rejects.toThrow(
      'execute: unknown responsibility "not_a_real_key"',
    );

    expect(stepWriter.open).toHaveBeenCalledWith(
      expect.objectContaining({ kind: DeskEpisodeStepKind.EXECUTE, toolName: 'send-email' }),
    );
    expect(stepWriter.failed).toHaveBeenCalledWith(
      expect.objectContaining({
        stepId: 'step-1',
        errorMessage: expect.stringContaining('no registry definition'),
      }),
    );
    // Never reaches the pipeline.
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it('fails closed when the executed tool has no registered scope', async () => {
    const { stepWriter, pipeline } = setup(makeEpisode());

    await expect(executeStep({ episodeId: EPISODE_ID, tool: 'unknown-tool', args: {} })).rejects.toThrow(
      'execute: unknown tool "unknown-tool"',
    );

    expect(stepWriter.failed).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expect.stringContaining('no scope registered') }),
    );
    expect(pipeline.run).not.toHaveBeenCalled();
  });

  it('fails closed when the owner agent has no supervisor', async () => {
    const { stepWriter, pipeline } = setup(makeEpisode({ ownerAgent: { supervisorUserId: null } }));

    await expect(executeStep({ episodeId: EPISODE_ID, tool: 'send-email', args: {} })).rejects.toThrow(
      'execute: agent has no supervisor',
    );

    expect(stepWriter.failed).toHaveBeenCalledWith(
      expect.objectContaining({ errorMessage: expect.stringContaining('no supervisor') }),
    );
    expect(pipeline.run).not.toHaveBeenCalled();
  });
});
