// Mock every step module up-front so their real implementations (which
// transitively import Mastra/Langfuse ESM) never load in Jest. Factory
// form runs before any `import` statement below is resolved.
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

import { arFollowupHandler } from './ar-followup.function';

import type { CloseOutput, GateStepOutput } from '../../../shared-steps/step.types';
import type { HydrateOutput } from '../step.types';
import type { ArFollowup as ArFollowupTypes } from '@sally/shared-types';

const hydrateMock = hydrateStep as jest.MockedFunction<typeof hydrateStep>;
const perceiveMock = perceiveStep as jest.MockedFunction<typeof perceiveStep>;
const decideMock = decideStep as jest.MockedFunction<typeof decideStep>;
const draftMock = draftStep as jest.MockedFunction<typeof draftStep>;
const gateMock = gateStep as jest.MockedFunction<typeof gateStep>;
const executeMock = executeStep as jest.MockedFunction<typeof executeStep>;
const closeMock = closeStep as jest.MockedFunction<typeof closeStep>;

/**
 * Minimal fake Inngest `step` object sufficient for exercising the
 * workflow handler. Each `step.run` just invokes the handler; we don't
 * simulate Inngest's retry budget (that's tested by Inngest itself).
 * A step throw inside `try` propagates to the handler's top-level catch.
 */
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
      invoiceNumber: 'NL-INV-1015',
      idempotencyKey: 'ar_followup:invoice:NL-INV-1015:2026-04-24',
    },
  };
}

function makeHydrateOutput(preflightAction: 'proceed' | 'skip' | 'abort' = 'proceed'): HydrateOutput {
  return {
    entity: {
      invoice: {
        invoiceNumber: 'NL-INV-1015',
        amount: 968,
        daysFromDue: 47,
        customerId: '42',
        customerName: 'Granite State Lumber',
        customerEmail: 'billing@gsl.example.com',
        paidCents: 0,
        balanceCents: 96800,
        totalCents: 96800,
        issueDate: '2025-12-01',
        dueDate: '2026-01-01',
        status: 'OVERDUE',
        internalNotes: null,
      },
      customerStats: {
        dsoDays: 35,
        avgDaysLate: 4,
        openInvoiceCount: 2,
        openBalanceCents: 96800,
      },
      priorReminderCount: 0,
      priorReminders: [],
    },
    memories: [],
    preflight:
      preflightAction === 'proceed'
        ? { action: 'proceed' }
        : { action: preflightAction, outcome: 'preflight_skipped', reason: 'already paid' },
  };
}

function makePerceiveOutput(): ArFollowupTypes.ArFollowupPerceive {
  return {
    invoiceState: 'past_due_30_60',
    daysFromDue: 47,
    lastContact: { kind: 'none', daysAgo: null },
    paymentHistorySignal: 'reliable',
    promiseToPayOnFile: { exists: false, dueDate: null, broken: false },
    summary: 'Reliable payer, light nudge appropriate.',
    confidence: 0.78,
  };
}

function makeDecideOutput(
  action: ArFollowupTypes.ArFollowupDecide['action'] = 'send_reminder',
): ArFollowupTypes.ArFollowupDecide {
  return {
    action,
    reasoning: 'First reminder; reliable payer',
    tone: 'friendly',
    urgency: 'low',
    confidence: 0.8,
  };
}

function makeDraftOutput(): ArFollowupTypes.ArFollowupDraft {
  return {
    to: 'billing@gsl.example.com',
    subject: 'Quick Check-In: Invoice NL-INV-1015',
    body: 'Hope things are going well...',
    toneUsed: 'friendly',
    mentionsAmount: true,
    mentionsDueDate: true,
    confidence: 0.82,
  };
}

function makeCloseOutput(episodeId = 'e1', outcome = 'followup_sent'): CloseOutput {
  return {
    episodeId,
    outcome,
    closedAt: new Date().toISOString(),
  };
}

function makeGateOutput(needsApproval = false, approvalId?: string): GateStepOutput {
  return {
    needsApproval,
    approvalId,
    rule: 'test-rule',
  };
}

describe('arFollowupHandler', () => {
  beforeEach(() => {
    hydrateMock.mockReset().mockResolvedValue(makeHydrateOutput());
    perceiveMock.mockReset().mockResolvedValue(makePerceiveOutput());
    decideMock.mockReset().mockResolvedValue(makeDecideOutput());
    draftMock.mockReset().mockResolvedValue(makeDraftOutput());
    gateMock.mockReset().mockResolvedValue(makeGateOutput(false));
    executeMock.mockReset().mockResolvedValue({ toolResult: {} });
    closeMock.mockReset().mockResolvedValue(makeCloseOutput());
  });

  describe('happy path — send reminder without approval', () => {
    it('hydrates → perceives → decides → drafts → gates → executes → closes', async () => {
      const step = makeFakeStep();
      const event = makeFakeEvent();

      const result = await arFollowupHandler({ event, step } as never);

      expect(hydrateMock).toHaveBeenCalledTimes(1);
      expect(perceiveMock).toHaveBeenCalledTimes(1);
      expect(decideMock).toHaveBeenCalledTimes(1);
      expect(draftMock).toHaveBeenCalledTimes(1);
      expect(gateMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 'e1',
          outcome: 'followup_sent',
        }),
      );
      expect(result).toMatchObject({ episodeId: 'e1', outcome: 'followup_sent' });
    });
  });

  describe('preflight branches', () => {
    it('closes early with preflight outcome when preflight.action !== proceed', async () => {
      hydrateMock.mockResolvedValue(makeHydrateOutput('skip'));
      const step = makeFakeStep();
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(perceiveMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 'e1',
          outcome: 'preflight_skipped',
          outcomeNote: 'already paid',
        }),
      );
    });
  });

  describe('no-action branch', () => {
    it('closes with no_action_needed when decide.action === no_action', async () => {
      decideMock.mockResolvedValue(makeDecideOutput('no_action'));
      const step = makeFakeStep();
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(draftMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'no_action_needed',
        }),
      );
    });
  });

  describe('record-promise / escalate branches (no draft)', () => {
    it('goes through gate+execute without drafting when action === record_promise', async () => {
      decideMock.mockResolvedValue({
        ...makeDecideOutput('record_promise'),
        plannedArgs: { invoiceNumber: 'NL-INV-1015', promisedDate: '2026-05-01' },
      });
      const step = makeFakeStep();
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(draftMock).not.toHaveBeenCalled();
      expect(gateMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'promise_recorded' }));
    });

    it('escalate action closes with escalated_to_human after gate+execute', async () => {
      decideMock.mockResolvedValue({
        ...makeDecideOutput('escalate'),
        plannedArgs: {},
      });
      const step = makeFakeStep();
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'escalated_to_human' }));
    });

    it('approval_expired (record-promise branch) when waitForEvent returns null', async () => {
      decideMock.mockResolvedValue({
        ...makeDecideOutput('record_promise'),
        plannedArgs: { invoiceNumber: 'NL-INV-1015' },
      });
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue(null); // timed out
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'approval_expired',
          outcomeNote: expect.stringContaining('No decision within 7d for record-promise-to-pay'),
        }),
      );
    });

    it('rejected_by_operator (record-promise branch) when approval is REJECTED', async () => {
      decideMock.mockResolvedValue({
        ...makeDecideOutput('record_promise'),
        plannedArgs: {},
      });
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'REJECTED', rejectionReason: 'not yet' },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: 'not yet',
        }),
      );
    });

    it('uses editedAction when approval EDITS plannedArgs', async () => {
      decideMock.mockResolvedValue({
        ...makeDecideOutput('record_promise'),
        plannedArgs: { original: true },
      });
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'APPROVED', editedAction: { edited: true } },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ args: { edited: true } }));
    });
  });

  describe('send-reminder approval flow', () => {
    it('waits for approval, accepts APPROVED, then closes as followup_sent', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'APPROVED' },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'followup_sent',
          outcomeNote: 'approved on attempt 1',
        }),
      );
    });

    it('notes "(edited)" in outcomeNote when approval is EDITED', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'EDITED', editedAction: { to: 'new@x.com' } },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ args: { to: 'new@x.com' } }));
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcomeNote: expect.stringContaining('(edited)'),
        }),
      );
    });

    it('approval_expired on send-reminder when waitForEvent times out', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue(null);
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'approval_expired' }));
    });

    it('terminateEpisode closes as rejected_by_operator', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { terminateEpisode: true, rejectionReason: 'wrong customer' },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: 'wrong customer',
        }),
      );
    });

    it('terminateEpisode with no rejectionReason falls back to default copy', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { terminateEpisode: true },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: 'operator chose Reject & close',
        }),
      );
    });

    it('loops on REJECTED (non-terminate), passes rejectionReason to next draft, and closes after 4 rejections', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'REJECTED', rejectionReason: 'too formal' },
      });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      // MAX_RETRIES = 3 so loop runs 4 times (0..3)
      expect(draftMock).toHaveBeenCalledTimes(4);
      // 2nd and subsequent draft calls should receive a rejectionReason
      expect(draftMock.mock.calls[1][0]).toMatchObject({
        rejectionReason: 'too formal',
      });
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: expect.stringContaining('Retry cap (3) reached'),
        }),
      );
    });

    it('REJECTED without rejectionReason falls back to "Previous draft rejected"', async () => {
      gateMock.mockResolvedValue(makeGateOutput(true, 'appr-1'));
      const step = makeFakeStep();
      // First call rejects, second succeeds — just to ensure the rejection
      // reason fallback was used on attempt 2.
      step.waitForEvent
        .mockResolvedValueOnce({ data: { decision: 'REJECTED' } })
        .mockResolvedValueOnce({ data: { decision: 'APPROVED' } });
      const event = makeFakeEvent();

      await arFollowupHandler({ event, step } as never);

      expect(draftMock.mock.calls[1][0]).toMatchObject({
        rejectionReason: 'Previous draft rejected',
      });
    });
  });

  describe('auto-escalate on terminal step failure (T27e)', () => {
    it('auto-escalates and calls closeStep when perceive throws terminally', async () => {
      perceiveMock.mockRejectedValue(new Error('boom'));
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();
      const event = makeFakeEvent('e1');

      await expect(arFollowupHandler({ event, step } as never)).rejects.toThrow('boom');

      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          episodeId: 'e1',
          outcome: 'escalated_to_human',
          outcomeNote: expect.stringContaining('step perceive failed: boom'),
          terminalStatus: 'ESCALATED',
        }),
      );
    });

    it('truncates a long error message to 500 chars in outcomeNote', async () => {
      const longMsg = 'x'.repeat(1000);
      decideMock.mockRejectedValue(new Error(longMsg));
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();
      const event = makeFakeEvent('e1');

      await expect(arFollowupHandler({ event, step } as never)).rejects.toThrow();

      const call = closeMock.mock.calls.find(([arg]) => (arg as { outcome: string }).outcome === 'escalated_to_human');
      expect(call).toBeDefined();
      const note = (call[0] as { outcomeNote: string }).outcomeNote;
      // Prefix "step decide failed: " is 20 chars + up to 500 of the message
      expect(note.length).toBeLessThanOrEqual(20 + 500);
      expect(note).toContain('step decide failed: ');
      // The truncated message portion must not include the full 1000-char payload
      const msgPortion = note.replace('step decide failed: ', '');
      expect(msgPortion.length).toBeLessThanOrEqual(500);
    });

    it('escalates via a distinct inngest step id (auto-escalate-close) separate from success close', async () => {
      draftMock.mockRejectedValue(new Error('draft exploded'));
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();
      const event = makeFakeEvent('e1');

      await expect(arFollowupHandler({ event, step } as never)).rejects.toThrow('draft exploded');

      const stepIdsCalled = step.run.mock.calls.map(([id]) => id);
      expect(stepIdsCalled).toContain('auto-escalate-close');
      // The success-path id is 'close'; it must NOT have been used before
      // the failure (escalation close uses its own step id to avoid
      // Inngest memoization collisions on retry).
      expect(stepIdsCalled.filter((id) => id === 'close')).toHaveLength(0);
    });

    it('re-throws the original error so Inngest logs the failure', async () => {
      const originalErr = new Error('original failure');
      hydrateMock.mockRejectedValue(originalErr);
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();
      const event = makeFakeEvent('e1');

      await expect(arFollowupHandler({ event, step } as never)).rejects.toBe(originalErr);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'escalated_to_human',
          outcomeNote: expect.stringContaining('step hydrate failed: original failure'),
          terminalStatus: 'ESCALATED',
        }),
      );
    });

    it('handles non-Error thrown values (string) in outcomeNote', async () => {
      perceiveMock.mockImplementation(() => {
        throw 'plain string failure'; // eslint-disable-line @typescript-eslint/only-throw-error
      });
      closeMock.mockResolvedValue(makeCloseOutput('e1', 'escalated_to_human'));
      const step = makeFakeStep();
      const event = makeFakeEvent('e1');

      await expect(arFollowupHandler({ event, step } as never)).rejects.toBe('plain string failure');

      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'escalated_to_human',
          outcomeNote: expect.stringContaining('plain string failure'),
          terminalStatus: 'ESCALATED',
        }),
      );
    });
  });
});
