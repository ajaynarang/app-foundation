import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import type { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { HitlChallengeService } from '../hitl-challenge.service';
import { DOMAIN_EVENTS } from '../../../../platform-glue/events/domain-events.constants';

/**
 * Single use against real Postgres: many concurrent replays of one challenge token, and exactly one runs. The unit
 * spec proves the conditional update is issued; this proves Postgres makes it atomic (two transactions that both read
 * the open row cannot both mark it consumed).
 *
 * Skipped when DATABASE_URL is unset or names no usable database (unreachable, login refused, no such database, not
 * migrated, no tenant). The rows a run writes (its challenges and their outbox events) are deleted in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

/** No real tool has this name, so cleanup can key on it. */
const TOOL_NAME = 'single-use-race-fixture';
const PRINCIPAL_ID = 'apikey:single-use-race';
const DIGEST = 'a'.repeat(64);
const RACERS = 8;

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

describe('HITL challenge single use (Postgres)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let challenges: HitlChallengeService;
  let tenantId: number;
  let dbReachable = false;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('hitl-challenge.single-use: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      // Enough connections that the racers really run their transactions side by side.
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: RACERS + 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
      if (!tenant) {
        console.warn('hitl-challenge.single-use: no tenant in the database — skipping');
        return;
      }
      await prisma.hitlChallenge.count({ where: { toolName: TOOL_NAME } });
      tenantId = tenant.id;
      dbReachable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`hitl-challenge.single-use: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    const events = { publish: async () => undefined } as unknown as DomainEventService;
    challenges = new HitlChallengeService(prisma as any, new OutboxService(prisma as any, events));
  }, 30_000);

  afterAll(async () => {
    if (dbReachable) {
      const rows = await prisma.hitlChallenge.findMany({ where: { toolName: TOOL_NAME }, select: { id: true } });
      for (const { id } of rows) {
        await prisma.outboxEvent.deleteMany({
          where: {
            event: { in: [DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_COMPLETED, DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_ISSUED] },
            data: { path: ['token'], equals: String(id) },
          },
        });
      }
      await prisma.hitlChallenge.deleteMany({ where: { toolName: TOOL_NAME } });
    }
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  const openChallenge = async (overrides: Record<string, unknown> = {}) => {
    const row = await prisma.hitlChallenge.create({
      data: {
        tenantId,
        principalKind: 'api_key',
        principalId: PRINCIPAL_ID,
        toolName: TOOL_NAME,
        argsDigest: DIGEST,
        scopeRequired: 'platform:write',
        tier: 'standard',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        ...overrides,
      },
      select: { id: true },
    });
    return String(row.id);
  };

  const consume = (token: string) =>
    challenges.consume(token, { tenantId, principalId: PRINCIPAL_ID, toolName: TOOL_NAME, argsDigest: DIGEST });

  /**
   * The service over a client whose challenge read waits until every racer has read. So all of them see the open
   * row before any of them writes: the worst case of the race, every time, not only when the scheduler allows it.
   */
  const raceGatedService = () => {
    let arrived = 0;
    let release: () => void = () => undefined;
    const allRead = new Promise<void>((resolve) => (release = resolve));
    const gatedChallenges = new Proxy(prisma.hitlChallenge, {
      get(target, prop, receiver) {
        if (prop !== 'findFirst') return Reflect.get(target, prop, receiver);
        return async (args: Parameters<typeof target.findFirst>[0]) => {
          const row = await target.findFirst(args);
          arrived += 1;
          if (arrived === RACERS) release();
          await allRead;
          return row;
        };
      },
    });
    const gated = new Proxy(prisma, {
      get(target, prop, receiver) {
        return prop === 'hitlChallenge' ? gatedChallenges : Reflect.get(target, prop, receiver);
      },
    });
    const events = { publish: async () => undefined } as unknown as DomainEventService;
    return new HitlChallengeService(gated as any, new OutboxService(prisma as any, events));
  };

  it(`${RACERS} concurrent replays of one token, all reading it open: exactly one is spent`, async () => {
    if (!dbReachable) return;
    const token = await openChallenge();
    const racing = raceGatedService();

    const results = await Promise.all(
      Array.from({ length: RACERS }, () =>
        racing.consume(token, { tenantId, principalId: PRINCIPAL_ID, toolName: TOOL_NAME, argsDigest: DIGEST }),
      ),
    );

    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const row = await prisma.hitlChallenge.findUniqueOrThrow({ where: { id: Number(token) } });
    expect(row.consumedAt).not.toBeNull();
    const completed = await prisma.outboxEvent.count({
      where: { event: DOMAIN_EVENTS.AGENT_HITL_CHALLENGE_COMPLETED, data: { path: ['token'], equals: token } },
    });
    expect(completed).toBe(1);
  }, 30_000);

  it('a spent token is refused on the next replay', async () => {
    if (!dbReachable) return;
    const token = await openChallenge();
    expect(await consume(token)).not.toBeNull();
    expect(await consume(token)).toBeNull();
  }, 30_000);

  it('step-up cannot be completed on a used or an expired challenge', async () => {
    if (!dbReachable) return;
    const used = await openChallenge({ stepUpRequired: true, stepUpUserId: 1, consumedAt: new Date() });
    const expired = await openChallenge({
      stepUpRequired: true,
      stepUpUserId: 1,
      expiresAt: new Date(Date.now() - 1000),
    });
    const open = await openChallenge({ stepUpRequired: true, stepUpUserId: 1 });

    expect(await challenges.markStepUpCompleted(used, 1)).toBe(false);
    expect(await challenges.markStepUpCompleted(expired, 1)).toBe(false);
    expect(await challenges.markStepUpCompleted(open, 2)).toBe(false);
    expect(await challenges.markStepUpCompleted(open, 1)).toBe(true);
    expect(await challenges.markStepUpCompleted(open, 1)).toBe(false);
  }, 30_000);
});
