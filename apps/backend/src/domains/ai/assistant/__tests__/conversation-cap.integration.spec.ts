jest.mock('@presidio-dev/hai-guardrails', () => ({}));
jest.mock('redact-pii', () => ({}));
jest.mock('@mastra/pg', () => ({ PostgresStore: jest.fn() }));
jest.mock('@mastra/memory', () => ({ Memory: jest.fn() }));
jest.mock('@mastra/core', () => ({ Mastra: jest.fn() }));
jest.mock('@mastra/core/agent', () => ({ Agent: jest.fn() }));
jest.mock('@mastra/core/tools', () => ({ createTool: jest.fn() }));
jest.mock('@mastra/observability', () => ({ Observability: jest.fn() }));
jest.mock('@mastra/langfuse', () => ({ LangfuseExporter: jest.fn() }));
jest.mock('@rekog/mcp-nest', () => ({
  McpRegistryService: jest.fn(),
  Tool: () => () => {},
  McpModule: { forRoot: jest.fn() },
}));
jest.mock('langfuse', () => ({ Langfuse: jest.fn() }));

import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { MAX_ACTIVE_CONVERSATIONS } from '@app/shared-types';
import { createMockOutbox } from '@appshore/platform/test/mocks/outbox.mock';
import { AssistantAiService } from '../assistant.service';

/**
 * The rolling conversation cap on a real Postgres: the overflow query (order, skip) and the archive write run against
 * the real `conversations` table. Skipped when DATABASE_URL is unset or names no usable database. The tenant, user and
 * conversations it writes carry keys of their own and are deleted in afterAll.
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;
const TENANT_KEY = 'ws_conversation_cap_spec';
const USER_KEY = 'user_conversation_cap_spec';
const CONV_PREFIX = 'conv_capspec_';
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

describe('conversation cap (integration)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let usable = false;
  let tenantId: number;
  let userDbId: number;
  let service: AssistantAiService;
  let outbox: ReturnType<typeof createMockOutbox>;

  const cleanup = async () => {
    await prisma.conversation.deleteMany({ where: { user: { userId: USER_KEY } } });
    await prisma.user.deleteMany({ where: { userId: USER_KEY } });
    await prisma.tenant.deleteMany({ where: { tenantId: TENANT_KEY } });
  };

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('conversation-cap.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      await cleanup();
      tenantId = (await prisma.tenant.create({ data: { tenantId: TENANT_KEY, companyName: 'Conversation cap spec' } }))
        .id;
      userDbId = (
        await prisma.user.create({
          data: { userId: USER_KEY, firstName: 'Cap', lastName: 'Spec', role: 'MEMBER', tenantId },
        })
      ).id;
      usable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`conversation-cap.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }
    outbox = createMockOutbox(prisma);
    const unused = {} as never;
    service = new AssistantAiService(
      prisma as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      outbox as never,
    );
  }, 30_000);

  afterAll(async () => {
    if (usable) await cleanup();
    await prisma?.$disconnect();
    await pool?.end();
  }, 30_000);

  beforeEach(async () => {
    if (!usable) return;
    await prisma.conversation.deleteMany({ where: { userId: userDbId } });
    outbox.emit.mockClear();
  }, 30_000);

  /** `count` active conversations someone spoke in, the newest first by `updatedAt` (`n` = 0 is the newest). */
  async function seedSpokenConversations(count: number): Promise<void> {
    const now = Date.now();
    for (let n = 0; n < count; n++) {
      await prisma.conversation.create({
        data: {
          conversationId: `${CONV_PREFIX}${String(n).padStart(3, '0')}`,
          tenantId,
          userId: userDbId,
          userMode: 'member',
          title: `Question ${n}`,
          updatedAt: new Date(now - (n + 1) * 60_000),
          messages: {
            create: { messageId: `msg_capspec_${n}`, role: 'user', content: `Question ${n}`, inputMode: 'text' },
          },
        },
      });
    }
  }

  const active = () =>
    prisma.conversation.findMany({
      where: { userId: userDbId, tenantId, isActive: true },
      select: { conversationId: true },
    });

  it('a new chat at the cap archives the oldest one, keeps its rows, and says so with an event', async () => {
    if (!usable) return;
    await seedSpokenConversations(MAX_ACTIVE_CONVERSATIONS);

    const created = await service.createConversation(USER_KEY, tenantId, 'member');

    const stillActive = (await active()).map((c) => c.conversationId);
    expect(stillActive).toHaveLength(MAX_ACTIVE_CONVERSATIONS);
    expect(stillActive).toContain(created.conversationId);
    const oldest = `${CONV_PREFIX}${String(MAX_ACTIVE_CONVERSATIONS - 1).padStart(3, '0')}`;
    expect(stillActive).not.toContain(oldest);
    const archived = await prisma.conversation.findUnique({
      where: { conversationId: oldest },
      include: { messages: true },
    });
    expect(archived).toMatchObject({ isActive: false });
    expect(archived?.messages).toHaveLength(1);
    expect(outbox.emit).toHaveBeenCalledTimes(1);
    expect(outbox.emit).toHaveBeenCalledWith('app.conversation.archived', tenantId, {
      conversationId: oldest,
      reason: 'cap',
    });
  }, 30_000);

  it('a person already far over the cap is trimmed to the cap on their next new chat', async () => {
    if (!usable) return;
    await seedSpokenConversations(MAX_ACTIVE_CONVERSATIONS + 5);

    await service.createConversation(USER_KEY, tenantId, 'member');

    expect(await active()).toHaveLength(MAX_ACTIVE_CONVERSATIONS);
    expect(outbox.emit).toHaveBeenCalledTimes(6);
  }, 30_000);

  it('opening the assistant again reuses the conversation nobody spoke in, so it never counts twice', async () => {
    if (!usable) return;
    const first = await service.createConversation(USER_KEY, tenantId, 'member');
    const second = await service.createConversation(USER_KEY, tenantId, 'member');

    expect(second.conversationId).toBe(first.conversationId);
    expect(await active()).toHaveLength(1);
  }, 30_000);

  it('history lists active conversations someone spoke in, never archived or greeting-only ones', async () => {
    if (!usable) return;
    await seedSpokenConversations(2);
    await service.createConversation(USER_KEY, tenantId, 'member'); // greeting only
    await service.archiveConversation(`${CONV_PREFIX}001`, USER_KEY, tenantId);

    const { conversations } = await service.listConversations(USER_KEY, tenantId);

    expect(conversations.map((c) => c.conversationId)).toEqual([`${CONV_PREFIX}000`]);
  }, 30_000);
});
