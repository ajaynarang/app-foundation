// deskStep checks the episode's tenant; every fake event below is tenant 10.
jest.mock('../../../core/inngest/episode-tenant', () => ({ loadEpisodeTenantId: jest.fn(async () => 10) }));
// The real steps pull in the AI stack; the workflow is tested against fakes of each.
jest.mock('../steps/hydrate.step', () => ({ hydrateStep: jest.fn() }));
jest.mock('../steps/perceive.step', () => ({ perceiveStep: jest.fn() }));
jest.mock('../steps/decide.step', () => ({ decideStep: jest.fn() }));
jest.mock('../steps/draft.step', () => ({ draftStep: jest.fn() }));
jest.mock('../../../shared-steps/gate.step', () => ({ gateStep: jest.fn() }));
jest.mock('../../../shared-steps/execute.step', () => ({ executeStep: jest.fn() }));
jest.mock('../../../shared-steps/close.step', () => ({ closeStep: jest.fn() }));

import { DeskTenantMismatchError } from '../../../core/inngest/desk-step';
import { loadEpisodeTenantId } from '../../../core/inngest/episode-tenant';
import { closeStep } from '../../../shared-steps/close.step';
import { executeStep } from '../../../shared-steps/execute.step';
import { gateStep } from '../../../shared-steps/gate.step';
import { decideStep } from '../steps/decide.step';
import { draftStep } from '../steps/draft.step';
import { hydrateStep } from '../steps/hydrate.step';
import { perceiveStep } from '../steps/perceive.step';
import { DECIDE, DRAFT, PERCEIVE, makeHydrate } from '../__tests__/fixtures';
import { supportFollowupHandler } from './support-followup.function';

const hydrateMock = hydrateStep as jest.MockedFunction<typeof hydrateStep>;
const perceiveMock = perceiveStep as jest.MockedFunction<typeof perceiveStep>;
const decideMock = decideStep as jest.MockedFunction<typeof decideStep>;
const draftMock = draftStep as jest.MockedFunction<typeof draftStep>;
const gateMock = gateStep as jest.MockedFunction<typeof gateStep>;
const executeMock = executeStep as jest.MockedFunction<typeof executeStep>;
const closeMock = closeStep as jest.MockedFunction<typeof closeStep>;
const tenantMock = loadEpisodeTenantId as jest.MockedFunction<typeof loadEpisodeTenantId>;

const event = {
  data: {
    episodeId: 'e1',
    tenantId: 10,
    ticketNumber: 'ST-1001',
    idempotencyKey: 'support_followup:e1',
  },
};

/** A fake Inngest `step`: `run` calls through, `waitForEvent` answers what the test queued. */
function makeStep(...approvals: Array<Record<string, unknown> | null>) {
  const waitForEvent = jest.fn();
  for (const data of approvals) waitForEvent.mockResolvedValueOnce(data && { data });
  return { run: jest.fn(async (_id: string, fn: () => unknown) => await fn()), waitForEvent };
}
const stepIds = (step: ReturnType<typeof makeStep>) => step.run.mock.calls.map(([id]) => id);
const run = (step: ReturnType<typeof makeStep>) => supportFollowupHandler({ event, step: step as never });
const closedWith = () => closeMock.mock.calls[closeMock.mock.calls.length - 1][0];

const ASK = { needsApproval: true, approvalId: 'a1', rule: 'supervised_gates_standard' };
const ACT = { needsApproval: false, rule: 'assisted_ok' };

beforeEach(() => {
  jest.clearAllMocks();
  tenantMock.mockResolvedValue(10);
  hydrateMock.mockResolvedValue(makeHydrate());
  perceiveMock.mockResolvedValue(PERCEIVE);
  decideMock.mockResolvedValue(DECIDE);
  draftMock.mockResolvedValue(DRAFT);
  gateMock.mockResolvedValue(ACT);
  executeMock.mockResolvedValue({ toolResult: {} });
  closeMock.mockImplementation(async (input) => ({
    episodeId: input.episodeId,
    outcome: input.outcome,
    closedAt: 'now',
  }));
});

describe('support follow-up workflow', () => {
  it('closes before any model call when preflight says skip', async () => {
    hydrateMock.mockResolvedValue({
      ...makeHydrate(),
      preflight: { action: 'skip', outcome: 'preflight_skipped', reason: 'Last reply was 1 day(s) ago' },
    });
    const step = makeStep();
    await run(step);

    expect(stepIds(step)).toEqual(['hydrate', 'close']);
    expect(perceiveMock).not.toHaveBeenCalled();
    expect(closedWith()).toEqual({
      episodeId: 'e1',
      outcome: 'preflight_skipped',
      outcomeNote: 'Last reply was 1 day(s) ago',
    });
  });

  it('closes with no action, and no gate, when the model says leave it', async () => {
    decideMock.mockResolvedValue({ ...DECIDE, action: 'no_action', reasoning: 'Support answered in the thread.' });
    const step = makeStep();
    await run(step);

    expect(stepIds(step)).toEqual(['hydrate', 'perceive', 'decide', 'close']);
    expect(gateMock).not.toHaveBeenCalled();
    expect(closedWith()).toMatchObject({ outcome: 'no_action_needed', transition: 'no_action' });
  });

  it('hands the ticket to a person, with no tool run, when the model says escalate', async () => {
    decideMock.mockResolvedValue({ ...DECIDE, action: 'escalate', reasoning: 'Critical and unanswered twice.' });
    const step = makeStep();
    await run(step);

    expect(executeMock).not.toHaveBeenCalled();
    expect(closedWith()).toMatchObject({ outcome: 'escalated_to_human', terminalStatus: 'ESCALATED' });
    expect(closedWith().transition).toBeUndefined();
  });

  it('acts without asking when the gate lets it through', async () => {
    const step = makeStep();
    await run(step);

    expect(stepIds(step)).toEqual(['hydrate', 'perceive', 'decide', 'draft-0', 'gate-0', 'execute-0', 'close']);
    expect(step.waitForEvent).not.toHaveBeenCalled();
    expect(gateMock).toHaveBeenCalledWith({
      episodeId: 'e1',
      tool: 'reply-to-support-ticket',
      proposedArgs: { ticketNumber: 'ST-1001', content: DRAFT.content },
      proposedAction: { ticketNumber: 'ST-1001', content: DRAFT.content },
    });
    expect(executeMock).toHaveBeenCalledWith({
      episodeId: 'e1',
      tool: 'reply-to-support-ticket',
      args: { ticketNumber: 'ST-1001', content: DRAFT.content, idempotencyKey: 'desk:e1:0' },
    });
    expect(closedWith()).toMatchObject({ outcome: 'followup_sent', transition: 'auto_send' });
  });

  it('waits for a person when the gate asks, then posts the approved draft', async () => {
    gateMock.mockResolvedValue(ASK);
    const step = makeStep({ decision: 'APPROVED', terminateEpisode: false });
    await run(step);

    expect(step.waitForEvent).toHaveBeenCalledWith('wait-approval-0', {
      event: 'app/desk.approval.decided',
      match: 'data.episodeId',
      timeout: '7d',
    });
    expect(executeMock.mock.calls[0][0].args).toMatchObject({ ticketNumber: 'ST-1001', content: DRAFT.content });
    expect(closedWith()).toMatchObject({ outcome: 'followup_sent', transition: 'approve_unchanged' });
  });

  it('posts the operator’s wording on an edit, and never lets the edit move the reply to another ticket', async () => {
    gateMock.mockResolvedValue(ASK);
    const step = makeStep({
      decision: 'EDITED',
      terminateEpisode: false,
      editedAction: { ticketNumber: 'ST-9999', content: '  Please escalate this today.  ', idempotencyKey: 'mine' },
    });
    await run(step);

    expect(executeMock.mock.calls[0][0].args).toEqual({
      ticketNumber: 'ST-1001',
      content: 'Please escalate this today.',
      idempotencyKey: 'desk:e1:0',
    });
    expect(closedWith()).toMatchObject({ outcome: 'followup_sent', transition: 'approve_edited' });
  });

  it('treats an edit that changed nothing, or carried no wording, as an unchanged approval', async () => {
    gateMock.mockResolvedValue(ASK);
    const step = makeStep({ decision: 'EDITED', terminateEpisode: false, editedAction: { content: '   ' } });
    await run(step);

    expect(executeMock.mock.calls[0][0].args.content).toBe(DRAFT.content);
    expect(closedWith()).toMatchObject({ transition: 'approve_unchanged' });
  });

  it('ignores a ticket number the model put in its draft', async () => {
    draftMock.mockResolvedValue({ ...DRAFT, ticketNumber: 'ST-6666' } as never);
    const step = makeStep();
    await run(step);

    expect(executeMock.mock.calls[0][0].args.ticketNumber).toBe('ST-1001');
    expect(gateMock.mock.calls[0][0].proposedAction).toEqual({ ticketNumber: 'ST-1001', content: DRAFT.content });
  });

  it('rewrites a rejected draft with the operator’s reason, then posts the one that is approved', async () => {
    gateMock.mockResolvedValue(ASK);
    draftMock.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce({ content: 'Shorter ask.', confidence: 0.8 });
    const step = makeStep(
      { decision: 'REJECTED', terminateEpisode: false, rejectionReason: 'Too long' },
      { decision: 'APPROVED', terminateEpisode: false },
    );
    await run(step);

    expect(draftMock.mock.calls[0][0].rejectionReason).toBeUndefined();
    expect(draftMock.mock.calls[1][0].rejectionReason).toBe('Too long');
    expect(stepIds(step)).toEqual([
      'hydrate',
      'perceive',
      'decide',
      'draft-0',
      'gate-0',
      'draft-1',
      'gate-1',
      'execute-1',
      'close',
    ]);
    expect(executeMock.mock.calls[0][0].args).toMatchObject({ content: 'Shorter ask.', idempotencyKey: 'desk:e1:1' });
    expect(closedWith()).toMatchObject({ outcome: 'followup_sent', outcomeNote: 'Approved on draft 2' });
  });

  it('stops after four rejected drafts', async () => {
    gateMock.mockResolvedValue(ASK);
    const rejected = { decision: 'REJECTED', terminateEpisode: false };
    const step = makeStep(rejected, rejected, rejected, rejected);
    await run(step);

    expect(draftMock).toHaveBeenCalledTimes(4);
    expect(draftMock.mock.calls[1][0].rejectionReason).toBe('The previous draft was rejected');
    expect(executeMock).not.toHaveBeenCalled();
    expect(closedWith()).toMatchObject({ outcome: 'rejected_by_operator', transition: 'reject' });
  });

  it('closes at once on reject and close', async () => {
    gateMock.mockResolvedValue(ASK);
    const step = makeStep({ decision: 'REJECTED', terminateEpisode: true, rejectionReason: 'We phoned them' });
    await run(step);

    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(executeMock).not.toHaveBeenCalled();
    expect(closedWith()).toMatchObject({
      outcome: 'rejected_by_operator',
      outcomeNote: 'We phoned them',
      transition: 'reject_and_close',
    });
  });

  it('closes as expired when nobody decides in time', async () => {
    gateMock.mockResolvedValue(ASK);
    const step = makeStep(null);
    await run(step);

    expect(executeMock).not.toHaveBeenCalled();
    expect(closedWith()).toMatchObject({ outcome: 'approval_expired', transition: 'approval_expired' });
  });

  it('escalates through a step of its own when a step fails for good, then lets the run fail', async () => {
    executeMock.mockRejectedValue(new Error('pipeline error: ticket not found'));
    const step = makeStep();

    await expect(run(step)).rejects.toThrow('ticket not found');
    expect(stepIds(step)).toContain('auto-escalate-close');
    expect(stepIds(step)).not.toContain('close');
    expect(closedWith()).toEqual({
      episodeId: 'e1',
      outcome: 'escalated_to_human',
      outcomeNote: 'step execute failed: pipeline error: ticket not found',
      terminalStatus: 'ESCALATED',
    });
  });

  it('names the failing step in the escalation note', async () => {
    perceiveMock.mockRejectedValue(new Error('AI budget reached'));
    await expect(run(makeStep())).rejects.toThrow('AI budget reached');
    expect(closedWith().outcomeNote).toBe('step perceive failed: AI budget reached');
  });

  it('refuses to run a step for an episode that belongs to another tenant', async () => {
    tenantMock.mockResolvedValue(11);
    await expect(run(makeStep())).rejects.toBeInstanceOf(DeskTenantMismatchError);
    expect(hydrateMock).not.toHaveBeenCalled();
    expect(executeMock).not.toHaveBeenCalled();
  });
});
