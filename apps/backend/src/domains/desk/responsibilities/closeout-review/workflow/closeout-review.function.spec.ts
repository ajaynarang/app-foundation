// Mock every step module up-front so their real implementations (which
// transitively import Mastra/Langfuse ESM) never load in Jest.
jest.mock('../steps/hydrate.step', () => ({ hydrateStep: jest.fn() }));
jest.mock('../steps/perceive.step', () => ({ perceiveStep: jest.fn() }));
jest.mock('../steps/decide.step', () => ({ decideStep: jest.fn() }));
jest.mock('../steps/draft.step', () => ({ draftStep: jest.fn() }));
jest.mock('../../../shared-steps/gate.step', () => ({ gateStep: jest.fn() }));
jest.mock('../../../shared-steps/execute.step', () => ({ executeStep: jest.fn() }));
jest.mock('../../../shared-steps/close.step', () => ({ closeStep: jest.fn() }));

import { closeStep } from '../../../shared-steps/close.step';
import { decideStep } from '../steps/decide.step';
import { draftStep } from '../steps/draft.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';

import { closeoutReviewHandler } from './closeout-review.function';

import type {
  CloseoutDecideOutput,
  CloseoutDraftOutput,
  CloseoutHydrateOutput,
  CloseoutPerceiveOutput,
} from '../step.types';
import type { CloseOutput, GateStepOutput } from '../../../shared-steps/step.types';

const hydrateMock = hydrateStep as jest.MockedFunction<typeof hydrateStep>;
const perceiveMock = perceiveStep as jest.MockedFunction<typeof perceiveStep>;
const decideMock = decideStep as jest.MockedFunction<typeof decideStep>;
const draftMock = draftStep as jest.MockedFunction<typeof draftStep>;
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
      loadNumber: 'LD-20260518-001',
      idempotencyKey: 'closeout_review:load:LD-20260518-001:2026-05-21',
    },
  };
}

function makeHydrateOutput(preflightAction: 'proceed' | 'skip' | 'abort' = 'proceed'): CloseoutHydrateOutput {
  return {
    entity: {
      load: {
        loadNumber: 'LD-20260518-001',
        customerId: '42',
        customerName: 'Acme Logistics',
        deliveredAt: '2026-05-18T00:00:00.000Z',
        hoursSinceDelivery: 72,
        billingStatus: 'APPROVED',
        status: 'DELIVERED',
      },
      readiness: { score: 100, hasBlockers: false, readyToApprove: true, blockers: [] },
      charges: {
        hasBillableCharges: true,
        billableTotalDollars: 2450,
        items: [
          { chargeType: 'linehaul', description: 'Line haul', quantity: 1, unitPriceDollars: 2450, totalDollars: 2450 },
        ],
      },
    },
    memories: [],
    preflight:
      preflightAction === 'proceed'
        ? { action: 'proceed' }
        : preflightAction === 'skip'
          ? { action: 'skip', outcome: 'no_action_needed', reason: 'No billable charges on this load' }
          : { action: 'abort', outcome: 'preflight_aborted', reason: 'Load already has an invoice' },
  };
}

function makePerceiveOutput(): CloseoutPerceiveOutput {
  return {
    billingState: 'billable',
    hoursSinceDelivery: 72,
    hasBillableCharges: true,
    blockers: [],
    summary: 'Delivered 3 days ago, ready to invoice.',
    confidence: 0.86,
  };
}

function makeDecideOutput(action: CloseoutDecideOutput['action'] = 'draft_invoice'): CloseoutDecideOutput {
  return {
    action,
    reasoning: action === 'draft_invoice' ? 'billable' : 'blocked',
    blockerReason: action === 'no_action' ? 'POD missing' : undefined,
    confidence: 0.85,
  };
}

function makeDraftOutput(): CloseoutDraftOutput {
  return {
    customerName: 'Acme Logistics',
    totalDollars: 2450,
    lineItems: [{ description: 'Line haul', quantity: 1, unitPriceDollars: 2450, totalDollars: 2450 }],
    summary: 'Ready to invoice — $2,450, Acme Logistics, 1 line item.',
    confidence: 0.88,
  };
}

function makeCloseOutput(episodeId = 'e1', outcome = 'invoice_drafted'): CloseOutput {
  return { episodeId, outcome, closedAt: new Date().toISOString() };
}

function makeGateOutput(needsApproval = false, approvalId?: string): GateStepOutput {
  return { needsApproval, approvalId, rule: 'test-rule' };
}

describe('closeoutReviewHandler', () => {
  beforeEach(() => {
    hydrateMock.mockReset().mockResolvedValue(makeHydrateOutput());
    perceiveMock.mockReset().mockResolvedValue(makePerceiveOutput());
    decideMock.mockReset().mockResolvedValue(makeDecideOutput());
    draftMock.mockReset().mockResolvedValue(makeDraftOutput());
    gateMock.mockReset().mockResolvedValue(makeGateOutput(false));
    executeMock.mockReset().mockResolvedValue({ toolResult: {} });
    closeMock.mockReset().mockResolvedValue(makeCloseOutput());
  });

  describe('happy path — draft invoice with approval (SUPERVISED)', () => {
    it('hydrates → perceives → decides → drafts → gates → waits → executes → closes as invoice_drafted', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'APPROVED' } });

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(hydrateMock).toHaveBeenCalledTimes(1);
      expect(perceiveMock).toHaveBeenCalledTimes(1);
      expect(decideMock).toHaveBeenCalledTimes(1);
      expect(draftMock).toHaveBeenCalledTimes(1);
      expect(gateMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'generate-invoice', args: { loadNumber: 'LD-20260518-001' } }),
      );
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'invoice_drafted',
          outcomeNote: 'approved on attempt 1',
          transition: 'approve_unchanged',
        }),
      );
    });

    it('auto-proceeds (no approval) when the gate does not require it', async () => {
      gateMock.mockResolvedValue(makeGateOutput(false));
      const step = makeFakeStep();

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(step.waitForEvent).not.toHaveBeenCalled();
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'invoice_drafted', transition: 'auto_send' }),
      );
    });
  });

  describe('blocked branches — never draft', () => {
    it('preflight skip closes as no_action_needed with the blocker reason, never perceiving', async () => {
      hydrateMock.mockResolvedValue(makeHydrateOutput('skip'));
      const step = makeFakeStep();

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(perceiveMock).not.toHaveBeenCalled();
      expect(draftMock).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'no_action_needed',
          outcomeNote: 'No billable charges on this load',
          transition: 'no_action',
        }),
      );
    });

    it('preflight abort (invoice now exists) closes as preflight_aborted with no transition', async () => {
      hydrateMock.mockResolvedValue(makeHydrateOutput('abort'));
      const step = makeFakeStep();

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(perceiveMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'preflight_aborted', outcomeNote: 'Load already has an invoice' }),
      );
      // abort is not a Sally decision → no memory transition fires
      const call = closeMock.mock.calls.find(([a]) => (a as { outcome: string }).outcome === 'preflight_aborted');
      expect((call?.[0] as { transition?: string }).transition).toBeUndefined();
    });

    it('decide no_action closes as no_action_needed with blockerReason, never drafting or executing', async () => {
      decideMock.mockResolvedValue(makeDecideOutput('no_action'));
      const step = makeFakeStep();

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(draftMock).not.toHaveBeenCalled();
      expect(gateMock).not.toHaveBeenCalled();
      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'no_action_needed', outcomeNote: 'POD missing', transition: 'no_action' }),
      );
    });
  });

  describe('approval decision branches', () => {
    it('approval_expired when waitForEvent times out — never executes', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue(null);

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'approval_expired', transition: 'approval_expired' }),
      );
    });

    it('terminateEpisode closes as rejected_by_operator (reject_and_close), never executes', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { terminateEpisode: true, rejectionReason: 'wrong customer' } });

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: 'wrong customer',
          transition: 'reject_and_close',
        }),
      );
    });

    it('EDITED approval still executes with the canonical { loadNumber } (invoice derives from real charges)', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'EDITED', editedAction: { totalDollars: 9999 } } });

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'generate-invoice', args: { loadNumber: 'LD-20260518-001' } }),
      );
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcomeNote: expect.stringContaining('(edited)'), transition: 'approve_edited' }),
      );
    });

    it('loops on REJECTED (non-terminate), feeds rejectionReason to next draft, closes after the retry cap', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'REJECTED', rejectionReason: 'wrong line item' } });

      await closeoutReviewHandler({ event: makeFakeEvent(), step } as never);

      // MAX_RETRIES = 3 → 4 draft attempts (0..3)
      expect(draftMock).toHaveBeenCalledTimes(4);
      expect(draftMock.mock.calls[1][0]).toMatchObject({ rejectionReason: 'wrong line item' });
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: expect.stringContaining('Retry cap (3) reached'),
          transition: 'reject',
        }),
      );
    });
  });

  describe('auto-escalate on terminal step failure', () => {
    it('escalates and re-throws when execute (generate-invoice race) throws', async () => {
      // Simulates the documented race: a manual invoice landed between hydrate
      // and execute, so generate-invoice returns isError → executeStep throws.
      executeMock.mockRejectedValue(new Error('Invoice INV-9 already exists for this load'));
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();

      await expect(closeoutReviewHandler({ event: makeFakeEvent('e1'), step } as never)).rejects.toThrow(
        'already exists',
      );

      const stepIdsCalled = step.run.mock.calls.map(([id]) => id);
      expect(stepIdsCalled).toContain('auto-escalate-close');
      expect(stepIdsCalled.filter((id) => id === 'close')).toHaveLength(0);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'escalated_to_human',
          outcomeNote: expect.stringContaining('step execute failed: Invoice INV-9 already exists'),
          terminalStatus: 'ESCALATED',
        }),
      );
    });

    it('escalates and re-throws when perceive throws, labeling the failed step', async () => {
      const err = new Error('boom');
      perceiveMock.mockRejectedValue(err);
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();

      await expect(closeoutReviewHandler({ event: makeFakeEvent('e1'), step } as never)).rejects.toBe(err);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'escalated_to_human',
          outcomeNote: expect.stringContaining('step perceive failed: boom'),
        }),
      );
    });
  });
});
