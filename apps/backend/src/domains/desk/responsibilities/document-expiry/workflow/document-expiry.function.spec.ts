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

import { documentExpiryHandler } from './document-expiry.function';

import type { CloseOutput, GateStepOutput } from '../../../shared-steps/step.types';
import type {
  DocumentExpiryDecideOutput,
  DocumentExpiryDraftOutput,
  DocumentExpiryHydrateOutput,
  DocumentExpiryPerceiveOutput,
} from '../step.types';

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
      driverId: 'DRV-1',
      credentialType: 'medical_card',
      idempotencyKey: 'document_expiry:driver:DRV-1:medical_card:2026-05-21',
    },
  };
}

function makeHydrateOutput(preflightAction: 'proceed' | 'skip' | 'abort' = 'proceed'): DocumentExpiryHydrateOutput {
  return {
    entity: {
      finding: {
        findingId: 'f1',
        driverId: 'DRV-1',
        driverName: 'Maria Lopez',
        severity: 'WARNING',
        credentialType: 'medical_card',
        credentialLabel: 'Medical card',
        dueDate: '2026-06-02',
        daysUntilExpiry: 12,
        recommendation: 'Schedule DOT physical.',
      },
      driverContact: { email: 'maria@example.com', phone: '+15551234567' },
      adminContact: { email: 'admin@example.com', phone: null },
      priorReminderCount: 0,
    },
    relationshipRef: { driverId: 'DRV-1', credentialType: 'medical_card' },
    memories: [],
    preflight:
      preflightAction === 'proceed'
        ? { action: 'proceed' }
        : { action: preflightAction, outcome: 'no_action_needed', reason: 'reminded recently' },
  };
}

function makePerceive(routeTo: 'driver' | 'admin' = 'driver'): DocumentExpiryPerceiveOutput {
  return {
    urgency: 'expiring_soon',
    daysUntilExpiry: 12,
    routeTo,
    summary: 'Medical card expiring in 12 days; nudge the driver.',
    confidence: 0.82,
  };
}

function makeDecide(overrides: Partial<DocumentExpiryDecideOutput> = {}): DocumentExpiryDecideOutput {
  return {
    action: 'send_reminder',
    channel: 'sms',
    recipient: 'driver',
    reasoning: 'Routine WARNING nudge to the driver',
    confidence: 0.85,
    ...overrides,
  };
}

function makeDraft(overrides: Partial<DocumentExpiryDraftOutput> = {}): DocumentExpiryDraftOutput {
  return {
    to: '+15551234567',
    subject: null,
    body: null,
    smsBody: 'Your medical card expires 2026-06-02 — please renew and send the new card.',
    mentionsCredential: true,
    mentionsDate: true,
    confidence: 0.84,
    ...overrides,
  };
}

function makeClose(episodeId = 'e1', outcome = 'reminder_sent'): CloseOutput {
  return { episodeId, outcome, closedAt: new Date().toISOString() };
}

function makeGate(needsApproval = false, approvalId?: string): GateStepOutput {
  return { needsApproval, approvalId, rule: 'test-rule' };
}

describe('documentExpiryHandler', () => {
  beforeEach(() => {
    hydrateMock.mockReset().mockResolvedValue(makeHydrateOutput());
    perceiveMock.mockReset().mockResolvedValue(makePerceive());
    decideMock.mockReset().mockResolvedValue(makeDecide());
    draftMock.mockReset().mockResolvedValue(makeDraft());
    gateMock.mockReset().mockResolvedValue(makeGate(false));
    executeMock.mockReset().mockResolvedValue({ toolResult: {} });
    closeMock.mockReset().mockResolvedValue(makeClose());
  });

  describe('happy path — auto-send SMS reminder to driver', () => {
    it('hydrates → perceives → decides → drafts → gates → executes send-sms → closes', async () => {
      const step = makeFakeStep();
      const result = await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(hydrateMock).toHaveBeenCalledTimes(1);
      expect(perceiveMock).toHaveBeenCalledTimes(1);
      expect(decideMock).toHaveBeenCalledTimes(1);
      expect(draftMock).toHaveBeenCalledTimes(1);
      expect(gateMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({ tool: 'send-sms', args: expect.objectContaining({ to: '+15551234567' }) }),
      );
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ episodeId: 'e1', outcome: 'reminder_sent' }));
      expect(result).toMatchObject({ outcome: 'reminder_sent' });
    });
  });

  describe('channel=both — sends email AND sms', () => {
    it('executes two comms tools', async () => {
      decideMock.mockResolvedValue(makeDecide({ channel: 'both', recipient: 'admin', action: 'escalate_to_admin' }));
      draftMock.mockResolvedValue(
        makeDraft({
          to: 'admin@example.com',
          subject: 'CDL expired — Maria',
          body: 'Maria’s CDL is expired; do not dispatch until renewed.',
          smsBody: 'Maria CDL expired — do not dispatch.',
        }),
      );
      // both-channel needs the SMS recipient to be a phone; supply a phone in `to`
      // for the SMS leg via a draft whose `to` is the email — planSends only
      // sends SMS when `to` is E.164, so here only email goes out.
      const step = makeFakeStep();
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      // Email leg fires (to is an email + subject + body present).
      expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ tool: 'send-email' }));
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'escalated_to_admin' }));
    });
  });

  describe('preflight skip', () => {
    it('closes early with no_action_needed when preflight !== proceed', async () => {
      hydrateMock.mockResolvedValue(makeHydrateOutput('skip'));
      const step = makeFakeStep();
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(perceiveMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'no_action_needed', outcomeNote: 'reminded recently' }),
      );
    });
  });

  describe('no_action branch', () => {
    it('closes with no_action_needed without drafting', async () => {
      decideMock.mockResolvedValue(makeDecide({ action: 'no_action' }));
      const step = makeFakeStep();
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(draftMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'no_action_needed' }));
    });
  });

  describe('escalate_to_admin', () => {
    it('drafts to admin and closes escalated_to_admin', async () => {
      decideMock.mockResolvedValue(makeDecide({ action: 'escalate_to_admin', channel: 'email', recipient: 'admin' }));
      draftMock.mockResolvedValue(
        makeDraft({ to: 'admin@example.com', subject: 'CDL expired', body: 'Pull from loads.', smsBody: null }),
      );
      const step = makeFakeStep();
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).toHaveBeenCalledWith(expect.objectContaining({ tool: 'send-email' }));
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'escalated_to_admin' }));
    });
  });

  describe('SUPERVISED approval flow', () => {
    it('waits for approval, accepts APPROVED, executes, closes reminder_sent', async () => {
      gateMock.mockResolvedValue(makeGate(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'APPROVED' } });
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).toHaveBeenCalledTimes(1);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'reminder_sent', transition: 'approve_unchanged' }),
      );
    });

    it('approval_expired when waitForEvent times out', async () => {
      gateMock.mockResolvedValue(makeGate(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue(null);
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'approval_expired' }));
    });

    it('terminateEpisode closes rejected_by_operator', async () => {
      gateMock.mockResolvedValue(makeGate(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { terminateEpisode: true, rejectionReason: 'wrong driver' } });
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).not.toHaveBeenCalled();
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'rejected_by_operator', outcomeNote: 'wrong driver' }),
      );
    });

    it('loops on REJECTED, passes rejectionReason to next draft, closes after retry cap', async () => {
      gateMock.mockResolvedValue(makeGate(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({ data: { decision: 'REJECTED', rejectionReason: 'too terse' } });
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(draftMock).toHaveBeenCalledTimes(4); // 0..3
      expect(draftMock.mock.calls[1][0]).toMatchObject({ rejectionReason: 'too terse' });
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'rejected_by_operator',
          outcomeNote: expect.stringContaining('Retry cap (3) reached'),
        }),
      );
    });

    it('EDITED applies editedAction and notes (edited)', async () => {
      gateMock.mockResolvedValue(makeGate(true, 'appr-1'));
      const step = makeFakeStep();
      step.waitForEvent.mockResolvedValue({
        data: { decision: 'EDITED', editedAction: { smsBody: 'Edited reminder body' } },
      });
      await documentExpiryHandler({ event: makeFakeEvent(), step } as never);

      expect(executeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'send-sms',
          args: expect.objectContaining({ message: 'Edited reminder body' }),
        }),
      );
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcomeNote: expect.stringContaining('(edited)'), transition: 'approve_edited' }),
      );
    });
  });

  describe('auto-escalate on terminal step failure', () => {
    it('auto-escalates via a distinct step id and re-throws', async () => {
      const originalErr = new Error('decide exploded');
      decideMock.mockRejectedValue(originalErr);
      closeMock.mockResolvedValue(makeClose('e1', 'escalated_to_human'));
      const step = makeFakeStep();

      await expect(documentExpiryHandler({ event: makeFakeEvent(), step } as never)).rejects.toBe(originalErr);

      const stepIds = step.run.mock.calls.map(([id]) => id);
      expect(stepIds).toContain('auto-escalate-close');
      expect(stepIds.filter((id) => id === 'close')).toHaveLength(0);
      expect(closeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'escalated_to_human',
          outcomeNote: expect.stringContaining('step decide failed: decide exploded'),
          terminalStatus: 'ESCALATED',
        }),
      );
    });
  });
});
