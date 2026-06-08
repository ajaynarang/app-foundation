import { buildDocumentExpiryApprovalPayload } from '../approval-adapter';
import type {
  DocumentExpiryDecideOutput,
  DocumentExpiryDraftOutput,
  DocumentExpiryHydrateOutput,
  DocumentExpiryPerceiveOutput,
} from '../step.types';

function hydrate(
  overrides: Partial<DocumentExpiryHydrateOutput['entity']['finding']> = {},
): DocumentExpiryHydrateOutput {
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
        ...overrides,
      },
      driverContact: { email: 'maria@example.com', phone: '+15551234567' },
      adminContact: { email: 'admin@example.com', phone: null },
      priorReminderCount: 0,
    },
    memories: [],
    preflight: { action: 'proceed' },
  };
}

function perceive(routeTo: 'driver' | 'admin' = 'driver'): DocumentExpiryPerceiveOutput {
  return {
    urgency: 'expiring_soon',
    daysUntilExpiry: 12,
    routeTo,
    summary: 'Medical card expiring in 12 days. Nudge the driver.',
    confidence: 0.82,
  };
}

function decide(overrides: Partial<DocumentExpiryDecideOutput> = {}): DocumentExpiryDecideOutput {
  return {
    action: 'send_reminder',
    channel: 'sms',
    recipient: 'driver',
    reasoning: 'r',
    confidence: 0.85,
    ...overrides,
  };
}

function draft(overrides: Partial<DocumentExpiryDraftOutput> = {}): DocumentExpiryDraftOutput {
  return {
    to: '+15551234567',
    subject: null,
    body: null,
    smsBody: 'Your medical card expires 2026-06-02 — please renew.',
    mentionsCredential: true,
    mentionsDate: true,
    confidence: 0.84,
    ...overrides,
  };
}

describe('buildDocumentExpiryApprovalPayload', () => {
  it('builds a message artifact for an SMS reminder', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: hydrate(),
      perceive: perceive(),
      decide: decide(),
      draft: draft(),
      proposedAction: {},
    });
    expect(payload.artifact).toEqual({
      kind: 'message',
      channel: 'sms',
      to: '+15551234567',
      subject: null,
      body: 'Your medical card expires 2026-06-02 — please renew.',
    });
  });

  it('uses the email body for the message artifact when channel includes email', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: hydrate(),
      perceive: perceive('admin'),
      decide: decide({ action: 'escalate_to_admin', channel: 'email', recipient: 'admin' }),
      draft: draft({ to: 'admin@example.com', subject: 'CDL expired', body: 'Pull from loads.', smsBody: null }),
      proposedAction: {},
    });
    expect(payload.artifact).toMatchObject({
      kind: 'message',
      channel: 'email',
      to: 'admin@example.com',
      subject: 'CDL expired',
      body: 'Pull from loads.',
    });
  });

  it('builds a reminder header for send_reminder', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: hydrate(),
      perceive: perceive(),
      decide: decide(),
      draft: draft(),
      proposedAction: {},
    });
    expect(payload.decisionHeader).toMatchObject({
      title: 'Reminder: Maria Lopez — Medical card',
      entityMeta: expect.stringContaining('expires 2026-06-02'),
    });
  });

  it('builds an escalate header for escalate_to_admin and an expired phrase', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: hydrate({ severity: 'CRITICAL', credentialType: 'cdl', credentialLabel: 'CDL', daysUntilExpiry: -3 }),
      perceive: perceive('admin'),
      decide: decide({ action: 'escalate_to_admin', channel: 'email', recipient: 'admin' }),
      draft: draft({ to: 'admin@example.com', subject: 'CDL expired', body: 'x', smsBody: null }),
      proposedAction: {},
    });
    expect(payload.decisionHeader?.title).toBe('Escalate to admin — Maria Lopez');
    expect(payload.decisionHeader?.entityMeta).toContain('expired 3 days ago');
  });

  it('derives Sally’s read from the first perceive sentence', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: hydrate(),
      perceive: perceive(),
      decide: decide(),
      draft: draft(),
      proposedAction: {},
    });
    expect(payload.sallysRead).toBe('Medical card expiring in 12 days.');
  });

  it('clamps confidence to 0..1 and prefers draft confidence', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: hydrate(),
      perceive: perceive(),
      decide: decide({ confidence: 0.5 }),
      draft: draft({ confidence: 0.91 }),
      proposedAction: {},
    });
    expect(payload.confidence).toBe(0.91);
  });

  it('falls back to a composite artifact when nothing renders', () => {
    const payload = buildDocumentExpiryApprovalPayload({
      hydrate: null,
      perceive: null,
      decide: null,
      draft: null,
      proposedAction: { channel: 'sms' },
    });
    expect(payload.artifact?.kind).toBe('composite');
    expect(payload.decisionHeader).toBeNull();
  });
});
