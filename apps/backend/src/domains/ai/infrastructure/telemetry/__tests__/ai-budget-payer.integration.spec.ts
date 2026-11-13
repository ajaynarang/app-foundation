import { PrismaClient, Prisma } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

import { generateUuidV7 } from '@appshore/kernel/shared/utils/uuidv7';
import { AiTelemetryService } from '../ai-telemetry.service';
import { AiBudgetExceededError } from '../ai-budget-exceeded.error';

/**
 * The budget's spend sum on a real Postgres: only what the platform paid counts toward the cap. The rows carry the
 * real `credential_type` strings, so the SQL of `PLATFORM_PAID_SQL` (with its escaped `PLATFORM\_%` pattern) runs.
 * Skipped when DATABASE_URL is unset or names no usable database. The tenant it creates has a key of its own and is
 * deleted (with its rows) in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_KEY = 'ws_ai_budget_payer_spec';
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

describe('AI budget counts platform-paid spend only (integration)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  let tenantId = 0;
  let service: AiTelemetryService;
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  // Pass-through cache: every check reads the ledger.
  const cache = {
    getOrSet: jest.fn(async (_key: string, factory: () => Promise<unknown>) => factory()),
    del: jest.fn().mockResolvedValue(undefined),
  };

  async function spend(credentialType: string | null, costUsd: string): Promise<void> {
    await prisma.aiInvocation.create({
      data: {
        id: generateUuidV7(),
        tenantId,
        surface: 'CHAT',
        model: 'anthropic/claude-sonnet-5.5',
        provider: 'openrouter',
        status: 'OK',
        costUsd: new Prisma.Decimal(costUsd),
        credentialType,
        routeId: credentialType === null ? null : credentialType.startsWith('PLATFORM_') ? 'platform-x' : 'aicred_x',
      },
    });
  }

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('ai-budget-payer.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await prisma.tenant.deleteMany({ where: { tenantId: TENANT_KEY } });
      const tenant = await prisma.tenant.create({
        data: { tenantId: TENANT_KEY, companyName: 'AI budget payer spec' },
      });
      tenantId = tenant.id;
      // STARTER caps: daily hard $20, monthly hard $200.
      await prisma.tenantAiBudget.create({ data: { tenantId, notes: 'plan:STARTER' } });
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`ai-budget-payer.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    service = new AiTelemetryService(prisma as never, cache as never, events as never, {} as never);
  }, 30_000);

  afterAll(async () => {
    if (usable) await prisma.tenant.deleteMany({ where: { tenantId: TENANT_KEY } });
    await prisma?.$disconnect();
    await pool?.end();
  });

  beforeEach(async () => {
    if (usable) await prisma.aiInvocation.deleteMany({ where: { tenantId } });
  });

  it('a workspace far over the cap on its own key is not blocked from a platform-paid call', async () => {
    if (!usable) return;
    await spend('ANTHROPIC_KEY', '5000');
    await spend('OPENROUTER_KEY', '900');
    await spend('PLATFORM_OPENROUTER', '1.5');

    const state = await service.assertBudget(tenantId);

    expect(state.state).toBe('ok');
    expect(state.dailyUsdSpent).toBe('1.500000');
  });

  it('platform-paid spend over the cap blocks', async () => {
    if (!usable) return;
    await spend('PLATFORM_OPENROUTER', '15');
    await spend('PLATFORM_COHERE', '6');

    await expect(service.assertBudget(tenantId)).rejects.toBeInstanceOf(AiBudgetExceededError);
  });

  it('rows with no credential type (written before routing) count as platform-paid', async () => {
    if (!usable) return;
    await spend(null, '25');

    const state = await service.checkBudget(tenantId);

    expect(state.state).toBe('hard');
    expect(state.dailyUsdSpent).toBe('25.000000');
  });

  it('a credential type that only contains PLATFORM is not platform-paid (the underscore is literal)', async () => {
    if (!usable) return;
    await spend('PLATFORMX_KEY', '500');

    expect((await service.checkBudget(tenantId)).state).toBe('ok');
  });
});
