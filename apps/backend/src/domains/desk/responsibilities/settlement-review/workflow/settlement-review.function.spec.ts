// Mock every step module up-front so their real implementations (which
// transitively import Mastra/Langfuse ESM) never load in Jest.
jest.mock('../steps/hydrate.step', () => ({ hydrateStep: jest.fn() }));
jest.mock('../steps/perceive.step', () => ({ perceiveStep: jest.fn() }));
jest.mock('../steps/decide.step', () => ({ decideStep: jest.fn() }));
jest.mock('../../../shared-steps/gate.step', () => ({ gateStep: jest.fn() }));
jest.mock('../../../shared-steps/execute.step', () => ({ executeStep: jest.fn() }));
jest.mock('../../../shared-steps/close.step', () => ({ closeStep: jest.fn() }));

import { closeStep } from '../../../shared-steps/close.step';
import { decideStep } from '../steps/decide.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';

import { settlementReviewHandler } from './settlement-review.function';

import type { GateStepOutput, CloseOutput } from '../../../shared-steps/step.types';
import type {
  SettlementReviewDecideOutput,
  SettlementReviewHydrateOutput,
  SettlementReviewPerceiveOutput,
} from '../step.types';

const hydrateMock = hydrateStep as jest.MockedFunction<typeof hydrateStep>;
const perceiveMock = perceiveStep as jest.MockedFunction<typeof perceiveStep>;
const decideMock = decideStep as jest.MockedFunction<typeof decideStep>;
const gateMock = gateStep as jest.MockedFunction<typeof gateStep>;
const executeMock = executeStep as jest.MockedFunction<typeof executeStep>;
const closeMock = closeStep as jest.MockedFunction<typeof closeStep>;

function makeFakeStep() {
  return {
    run: jest.fn(async (_id: string, fn: () => unknown) => await fn()),
    waitForEvent: jest.fn(),
  };
}

function makeFakeEvent(episodeId = 'e1') {
  return {
    data: {
      episodeId,
      tenantId: 10,
      settlementId: 'stl_1',
      idempotencyKey: 'settlement_review:settlement:stl_1:2026-05-21',
    },
  };
}

function makeHydrateOutput(
  preflightAction: 'proceed' | 'skip' | 'abort' = 'proceed',
  signalsOver: Partial<SettlementReviewHydrateOutput['entity']['signals']> = {},
): SettlementReviewHydrateOutput {
  return {
    entity: {
      settlement: {
        settlementId: 'stl_1',
        settlementNumber: 'STL-0001',
        driverId: 'drv_1',
        driverName: 'Alex Driver',
        status: 'DRAFT',
        periodStart: '2026-05-01',
        periodEnd: '2026-05-07',
        grossPayCents: 197000,
        deductionsCents: 15000,
        netPayCents: 182000,
        createdAt: '2026-05-19T00:00:00Z',
        ageDays: 2,
        lineItems: [{ description: 'Load A', loadNumber: 'L-1', payAmountCents: 197000 }],
        deductions: [{ type: 'FUEL_ADVANCE', description: 'Fuel', amountCents: 15000 }],
      },
      baseline: { avgNetPayCents: 180000, sampleSize: 6 },
      signals: {
        negativeNet: false,
        deductionsExceedGross: false,
        noLineItems: false,
        offAverage: false,
        stale: false,
        ...signalsOver,
      },
    },
    memories: [],
    preflight:
      preflightAction === 'proceed'
        ? { action: 'proceed' }
        : {
            action: preflightAction,
            outcome: preflightAction === 'abort' ? 'preflight_aborted' : 'preflight_skipped',
            reason: 'not draft',
          },
  };
}

function makePerceive(): SettlementReviewPerceiveOutput {
  return { summary: 'Clean and in range.', trippedSignals: [], looksClean: true, confidence: 0.85 };
}

function makeDecide(action: SettlementReviewDecideOutput['action'] = 'approve'): SettlementReviewDecideOutput {
  return { action, reasoning: 'within range', confidence: 0.88 };
}

function makeClose(episodeId = 'e1', outcome = 'settlement_approved'): CloseOutput {
  return { episodeId, outcome, closedAt: new Date().toISOString() };
}

function makeGate(needsApproval = true, approvalId = 'appr-1'): GateStepOutput {
  return { needsApproval, approvalId, rule: 'sensitive_always_gates' };
}

describe('settlementReviewHandler', () => {
  beforeEach(() => {
    hydrateMock.mockReset().mockResolvedValue(makeHydrateOutput());
    perceiveMock.mockReset().mockResolvedValue(makePerceive());
    decideMock.mockReset().mockResolvedValue(makeDecide('approve'));
    gateMock.mockReset().mockResolvedValue(makeGate(true));
    executeMock.mockReset().mockResolvedValue({ toolResult: {} });
    closeMock.mockReset().mockResolvedValue(makeClose());
  });

  describe('approve branch (clean settlement, sensitive gate → approval)', () => {
    it('hydrates → perceives → decides → gates → waits → executes → closes', async () => {
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'APPROVED' } });

      const result = await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(hydrateMock).toHaveBeenCalledTimes(1);
      expect(perceiveMock).toHaveBeenCalledTimes(1);
      expect(decideMock).toHaveBeenCalledTimes(1);
      expect(gateMock).toHaveBeenCalledTimes(1);
      expect(step.waitForEvent).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'approve-settlement', args: { settlementId: 'stl_1' } }),
      );
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'settlement_approved', transition: 'approve_unchanged' }),
      );
      expect(result).toMatchObject({ outcome: 'settlement_approved' });
    });

    it('uses editedAction when the operator edits before approving', async () => {
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'EDITED', editedAction: { settlementId: 'stl_other' } },
      });

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ args: { settlementId: 'stl_other' } }));
    });

    it('closes approval_expired when the wait times out', async () => {
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue(null);

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'approval_expired' }));
    });

    it('closes rejected_by_operator when REJECTED', async () => {
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'REJECTED', rejectionReason: 'wrong amount' } });

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'rejected_by_operator', outcomeNote: 'wrong amount', transition: 'reject' }),
      );
    });

    it('closes reject_and_close when terminateEpisode is set', async () => {
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { terminateEpisode: true, rejectionReason: 'void it' } });

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'rejected_by_operator', transition: 'reject_and_close' }),
      );
    });
  });

  describe('flag-anomaly branch — escalates, never approves', () => {
    it('closes anomaly_flagged (ESCALATED) without gate/execute when decide=flag_anomaly', async () => {
      decideMock.mockResolvedValue({
        action: 'flag_anomaly',
        anomalyKind: 'negativeNet',
        reasoning: 'net is -$200',
        confidence: 0.95,
      });
      const step = makeFakeStep();

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(gateMock).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
      expect(step.waitForEvent).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'anomaly_flagged',
          terminalStatus: 'ESCALATED',
          outcomeNote: 'net is -$200',
        }),
      );
    });
  });

  describe('no-action branch', () => {
    it('closes no_action_needed without gate/execute', async () => {
      decideMock.mockResolvedValue(makeDecide('no_action'));
      const step = makeFakeStep();

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(gateMock).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'no_action_needed', transition: 'no_action' }),
      );
    });
  });

  describe('preflight branches', () => {
    it('closes early when preflight aborts (no longer DRAFT)', async () => {
      hydrateMock.mockResolvedValue(makeHydrateOutput('abort'));
      const step = makeFakeStep();

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(perceiveMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'preflight_aborted' }));
    });

    it('closes early when preflight skips (excluded driver)', async () => {
      hydrateMock.mockResolvedValue(makeHydrateOutput('skip'));
      const step = makeFakeStep();

      await settlementReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(perceiveMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'preflight_skipped' }));
    });
  });

  describe('auto-escalate on terminal step failure', () => {
    it('escalates via a distinct step id and re-throws when decide explodes', async () => {
      const err = new Error('decide boom');
      decideMock.mockRejectedValue(err);
      closeMock.mockResolvedValue(makeClose('e1', 'escalated_to_human'));
      const step = makeFakeStep();

      await expect(settlementReviewHandler({ event: makeFakeEvent('e1'), step } as never)).rejects.toBe(err);

      const ids = step.run.mock.calls.map(([id]) => id);
      expect(ids).toContain('auto-escalate-close');
      expect(ids.filter((id) => id === 'close')).toHaveLength(0);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'escalated_to_human',
          terminalStatus: 'ESCALATED',
          outcomeNote: expect.stringContaining('step decide failed: decide boom'),
        }),
      );
    });
  });
});
