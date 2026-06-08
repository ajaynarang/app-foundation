import { DeskEpisodeStepKind } from '@prisma/client';

// nestApp() needs a live Nest container; replace it with a fake that
// returns our per-test service mocks.
const nestGet = jest.fn();
jest.mock('../../core/inngest/nest-context', () => ({
  nestApp: () => ({ get: nestGet }),
}));

import { ScopeRegistryService } from '../../../ai/agent-contract/scope-registry.service';
import { DeskStepWriter } from '../../core/episode/desk-step-writer.service';
import { ApprovalService } from '../../core/approval/approval.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { gateStep } from '../gate.step';

const EPISODE_ID = 'e1';

type EpisodeRow = {
  id: string;
  trustLevelSnapshot: 'SUPERVISED' | 'ASSISTED' | 'AUTONOMOUS';
  conditionsSnapshot: Record<string, unknown>;
  responsibility: { key: string };
};

function makeEpisode(overrides: Partial<EpisodeRow> = {}): EpisodeRow {
  return {
    id: EPISODE_ID,
    trustLevelSnapshot: 'ASSISTED',
    conditionsSnapshot: {},
    responsibility: { key: 'ar_followup' },
    ...overrides,
  };
}

function makeHydrateOutput(
  overrides: { amount?: number; customerId?: string | null; priorReminderCount?: number } = {},
) {
  return {
    entity: {
      invoice: {
        amount: overrides.amount ?? 1000,
        customerId: overrides.customerId ?? 'cust_acme',
      },
      priorReminderCount: overrides.priorReminderCount ?? 0,
    },
  };
}

function setup(opts: {
  episode: EpisodeRow;
  hydrate?: ReturnType<typeof makeHydrateOutput> | null;
  lastConfidence?: number | null;
  /** Scope `scopeForTool` returns. `null` => registry miss (undefined). */
  toolScope?: string | null;
}) {
  const { episode } = opts;
  const hydrate = opts.hydrate === undefined ? makeHydrateOutput() : opts.hydrate;

  const prisma = {
    deskEpisode: { findUniqueOrThrow: jest.fn().mockResolvedValue(episode) },
    deskEpisodeStep: {
      findFirst: jest.fn((args: { where: { kind?: unknown } }) => {
        // confidence lookup vs hydrate lookup distinguished by `kind`.
        const kind = args.where.kind;
        if (kind === DeskEpisodeStepKind.HYDRATE) {
          return Promise.resolve(hydrate === null ? null : { output: hydrate });
        }
        const conf = opts.lastConfidence === undefined ? 0.95 : opts.lastConfidence;
        return Promise.resolve(conf === null ? null : { confidence: conf });
      }),
    },
  };
  const resolvedScope = opts.toolScope === undefined ? 'comms:send' : (opts.toolScope ?? undefined);
  const scopeRegistry = {
    scopeForTool: jest.fn().mockReturnValue(resolvedScope),
  };
  const stepWriter = {
    open: jest.fn().mockResolvedValue({ id: 'step-1' }),
    succeeded: jest.fn().mockResolvedValue(undefined),
    gated: jest.fn().mockResolvedValue(undefined),
  };
  const approvalService = {
    create: jest.fn().mockResolvedValue({ id: 'appr-1' }),
  };

  nestGet.mockImplementation((token: unknown) => {
    if (token === PrismaService) return prisma;
    if (token === ScopeRegistryService) return scopeRegistry;
    if (token === DeskStepWriter) return stepWriter;
    if (token === ApprovalService) return approvalService;
    throw new Error('unexpected DI token requested in gateStep test');
  });

  return { prisma, scopeRegistry, stepWriter, approvalService };
}

beforeEach(() => {
  nestGet.mockReset();
});

describe('gateStep — registry-driven conditions evaluator (ar_followup)', () => {
  it('applies AR conditions: gates when amount exceeds maxAmountUsd (Assisted)', async () => {
    const { stepWriter, approvalService } = setup({
      episode: makeEpisode({
        trustLevelSnapshot: 'ASSISTED',
        conditionsSnapshot: { maxAmountUsd: 500 },
      }),
      hydrate: makeHydrateOutput({ amount: 1000 }),
      lastConfidence: 0.99,
    });

    const result = await gateStep({ episodeId: EPISODE_ID, tool: 'send-email', proposedArgs: {} });

    expect(result.needsApproval).toBe(true);
    expect(result.rule).toBe('assisted_conditions_failed');
    expect(approvalService.create).toHaveBeenCalledTimes(1);
    const gateDecision = stepWriter.gated.mock.calls[0][0].gateDecision;
    expect(gateDecision.checks.amountOk).toBe(false);
  });

  it('applies AR conditions: passes when conditions met + confidence ≥ 0.90 (Assisted)', async () => {
    const { stepWriter } = setup({
      episode: makeEpisode({
        trustLevelSnapshot: 'ASSISTED',
        conditionsSnapshot: { maxAmountUsd: 5000 },
      }),
      hydrate: makeHydrateOutput({ amount: 1000 }),
      lastConfidence: 0.95,
    });

    const result = await gateStep({ episodeId: EPISODE_ID, tool: 'send-email', proposedArgs: {} });

    expect(result.needsApproval).toBe(false);
    expect(result.rule).toBe('assisted_ok');
    expect(stepWriter.succeeded).toHaveBeenCalledTimes(1);
  });

  it('maps prior reminder count onto firstReminderOnly condition', async () => {
    const { stepWriter } = setup({
      episode: makeEpisode({
        trustLevelSnapshot: 'ASSISTED',
        conditionsSnapshot: { firstReminderOnly: true },
      }),
      hydrate: makeHydrateOutput({ priorReminderCount: 2 }),
      lastConfidence: 0.99,
    });

    const result = await gateStep({ episodeId: EPISODE_ID, tool: 'send-email', proposedArgs: {} });

    expect(result.rule).toBe('assisted_conditions_failed');
    const gateDecision = stepWriter.gated.mock.calls[0][0].gateDecision;
    expect(gateDecision.checks.firstReminderOk).toBe(false);
  });
});

describe('gateStep — evaluator-absent (no conditions schema)', () => {
  // eta_monitoring is a COMING_SOON stub: conditionsSchema = null, no
  // conditionsEvaluator. Conditions are treated as met; trust/confidence
  // rules still apply.
  it('treats conditions as met when the responsibility has no evaluator (Assisted passes on confidence)', async () => {
    const { stepWriter, approvalService } = setup({
      episode: makeEpisode({
        trustLevelSnapshot: 'ASSISTED',
        responsibility: { key: 'eta_monitoring' },
        conditionsSnapshot: { maxAmountUsd: 1 }, // would fail AR, but no evaluator runs
      }),
      hydrate: makeHydrateOutput({ amount: 1_000_000 }),
      lastConfidence: 0.95,
    });

    const result = await gateStep({ episodeId: EPISODE_ID, tool: 'send-email', proposedArgs: {} });

    expect(result.needsApproval).toBe(false);
    expect(result.rule).toBe('assisted_ok');
    expect(approvalService.create).not.toHaveBeenCalled();
    expect(stepWriter.succeeded).toHaveBeenCalledTimes(1);
  });

  it('still gates a Supervised standard-tier act even with no evaluator', async () => {
    const { approvalService } = setup({
      episode: makeEpisode({
        trustLevelSnapshot: 'SUPERVISED',
        responsibility: { key: 'eta_monitoring' },
      }),
      hydrate: makeHydrateOutput(),
    });

    const result = await gateStep({ episodeId: EPISODE_ID, tool: 'send-email', proposedArgs: {} });

    expect(result.needsApproval).toBe(true);
    expect(result.rule).toBe('supervised_gates_standard');
    expect(approvalService.create).toHaveBeenCalledTimes(1);
  });
});

describe('gateStep — guards', () => {
  it('throws when there is no hydrate step output', async () => {
    setup({ episode: makeEpisode(), hydrate: null });

    await expect(gateStep({ episodeId: EPISODE_ID, tool: 'send-email', proposedArgs: {} })).rejects.toThrow(
      'gate: no hydrate step output found',
    );
  });

  it('fails closed (gated) on unknown tool scope', async () => {
    const { approvalService } = setup({
      episode: makeEpisode({ trustLevelSnapshot: 'AUTONOMOUS' }),
      hydrate: makeHydrateOutput(),
      toolScope: null, // registry miss → scopeForTool returns undefined
    });

    const result = await gateStep({ episodeId: EPISODE_ID, tool: 'mystery-tool', proposedArgs: {} });

    expect(result.needsApproval).toBe(true);
    expect(result.rule).toBe('unknown_scope_fail_closed');
    expect(approvalService.create).toHaveBeenCalledTimes(1);
  });
});
