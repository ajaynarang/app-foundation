import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { fromApiKey } from '@appshore/platform/auth/agent-principal';
import type { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { HitlChallengeService } from '../hitl-challenge.service';
import { AgentActionsService } from '../agent-actions.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';

/**
 * In-app approval against real Postgres (item 8c): a standard write waits for a person, a retry before the decision
 * spends nothing, an approval lets exactly one retry run, a denial ends it, and a PIN row is never approved by the
 * button. The unit specs prove the calls; this proves the rows and the conditional writes behave.
 *
 * Skipped when DATABASE_URL is unset or names no usable database. Rows a run writes are deleted in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

/** No real tool has this name, so cleanup can key on it. */
const TOOL_NAME = 'agent-action-approval-fixture';
const DIGEST = 'b'.repeat(64);
const API_KEY_ID = 987_654;

const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'P1000',
  'P1001',
  'P1003',
  'P1010',
  'P2021',
]);

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && NO_DATABASE_CODES.has(code);
}

describe('agent action approval (Postgres)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let challenges: HitlChallengeService;
  let actions: AgentActionsService;
  let tenantId: number;
  let userId: number;
  let dbReachable = false;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('agent-actions.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
      const user = await prisma.user.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
      if (!tenant || !user) {
        console.warn('agent-actions.integration: no tenant or user in the database — skipping');
        return;
      }
      await prisma.hitlChallenge.count({ where: { toolName: TOOL_NAME, approvalRequired: true } });
      tenantId = tenant.id;
      userId = user.id;
      dbReachable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`agent-actions.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    const events = { publish: async () => undefined } as unknown as DomainEventService;
    const outbox = new OutboxService(prisma as any, events);
    challenges = new HitlChallengeService(prisma as any, outbox);
    actions = new AgentActionsService(prisma as any, outbox, challenges);
  }, 30_000);

  afterAll(async () => {
    if (dbReachable) {
      const rows = await prisma.hitlChallenge.findMany({ where: { toolName: TOOL_NAME }, select: { id: true } });
      const events = [
        DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_ISSUED,
        DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_COMPLETED,
        DOMAIN_EVENTS.AGENT_ACTION_APPROVED,
        DOMAIN_EVENTS.AGENT_ACTION_DENIED,
      ];
      for (const { id } of rows) {
        await prisma.outboxEvent.deleteMany({ where: { event: { in: events }, ...tokenEvent(String(id)) } });
      }
      await prisma.hitlChallenge.deleteMany({ where: { toolName: TOOL_NAME } });
    }
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  const tokenEvent = (token: string) => ({ data: { path: ['token'], equals: token } });

  const principal = () => fromApiKey({ apiKeyId: API_KEY_ID, tenantId, userId, scopes: ['platform:write'] });
  const consume = (token: string) =>
    challenges.consume(token, {
      tenantId,
      principalId: principal().auditId,
      toolName: TOOL_NAME,
      argsDigest: DIGEST,
    });
  const viewer = () => ({ userDbId: userId, tenantId, role: 'MEMBER' });

  const issue = (tier: 'standard' | 'sensitive') =>
    challenges.issue({
      principal: principal(),
      toolName: TOOL_NAME,
      scopeRequired: tier === 'sensitive' ? 'platform:write:sensitive' : 'platform:write',
      tier,
      argsDigest: DIGEST,
      approvalRequired: true,
      argsPreview: { subject: 'Printer', email: 'ada@example.com' },
      argsRedacted: { subject: 'Printer', email: '[redacted-email]' },
    });

  it('approve: pending until a person approves, then exactly one retry runs and the preview is dropped', async () => {
    if (!dbReachable) return;
    const { token, approvalRequired } = await issue('standard');
    expect(approvalRequired).toBe(true);

    expect(await consume(token)).toEqual({ ok: false, reason: 'pending' });
    expect(await actions.get(token, viewer())).toMatchObject({
      status: 'PENDING',
      args: { subject: 'Printer', email: 'ada@example.com' },
      canDecide: true,
    });

    expect(await actions.decide(token, viewer(), 'APPROVE')).toMatchObject({ status: 'APPROVED' });
    await expect(actions.decide(token, viewer(), 'DENY')).rejects.toMatchObject({ status: 409 });

    expect(await consume(token)).toMatchObject({ ok: true });
    expect(await consume(token)).toEqual({ ok: false, reason: 'invalid' });

    const row = await prisma.hitlChallenge.findUniqueOrThrow({ where: { id: Number(token) } });
    expect(row.argsPreview).toBeNull();
    expect(row.decidedById).toBe(userId);
    expect(
      await prisma.outboxEvent.count({ where: { event: DOMAIN_EVENTS.AGENT_ACTION_APPROVED, ...tokenEvent(token) } }),
    ).toBe(1);
  }, 30_000);

  it('deny: the retry answers denied and never runs; the preview is dropped at once', async () => {
    if (!dbReachable) return;
    const { token } = await issue('standard');

    expect(await actions.decide(token, viewer(), 'DENY')).toMatchObject({ status: 'DENIED', args: {} });
    expect(await consume(token)).toEqual({ ok: false, reason: 'denied' });

    const row = await prisma.hitlChallenge.findUniqueOrThrow({ where: { id: Number(token) } });
    expect(row.argsPreview).toBeNull();
    expect(row.consumedAt).toBeNull();
  }, 30_000);

  it('a sensitive write: the button cannot approve it, the PIN step does, and a denied one takes no PIN', async () => {
    if (!dbReachable) return;
    const { token, approvalRequired, stepUpRequired } = await issue('sensitive');
    expect({ approvalRequired, stepUpRequired }).toEqual({ approvalRequired: false, stepUpRequired: true });

    const shown = await actions.get(token, viewer());
    expect(shown).toMatchObject({ args: { email: '[redacted-email]' }, argsRedacted: true, canStepUp: true });

    await expect(actions.decide(token, viewer(), 'APPROVE')).rejects.toMatchObject({ status: 409 });
    expect(await consume(token)).toEqual({ ok: false, reason: 'pending' });

    expect(await challenges.markStepUpCompleted(token, userId)).toBe(true);
    expect(await consume(token)).toMatchObject({ ok: true });

    const denied = await issue('sensitive');
    await actions.decide(denied.token, viewer(), 'DENY');
    expect(await challenges.markStepUpCompleted(denied.token, userId)).toBe(false);
    expect(await consume(denied.token)).toEqual({ ok: false, reason: 'denied' });
  }, 30_000);

  it('another workspace cannot see the request', async () => {
    if (!dbReachable) return;
    const { token } = await issue('standard');
    await expect(actions.get(token, { ...viewer(), tenantId: tenantId + 100_000 })).rejects.toMatchObject({
      status: 404,
    });
  }, 30_000);
});
