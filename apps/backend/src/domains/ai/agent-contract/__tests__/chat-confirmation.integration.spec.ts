import { PrismaClient } from '@appshore/db';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { z } from 'zod';
import type { McpRegistryDiscoveryService } from '@rekog/mcp-nest';
import type { DomainEventService } from '@appshore/kernel/infrastructure/events/domain-event.service';
import { OutboxService } from '@appshore/platform/infrastructure/events/outbox.service';
import { fromUser } from '@appshore/platform/auth/agent-principal';
import { ScopeRegistryService } from '../scope-registry.service';
import { HitlPolicyService } from '../hitl-policy.service';
import { ToolExecutorService } from '../tool-executor.service';
import { InvocationPipelineService } from '../invocation-pipeline.service';
import { HitlChallengeService } from '../hitl-challenge.service';
import { RequiresScope } from '../requires-scope.decorator';
import { intentDigest } from '../intent-digest';

/**
 * Chat confirmation bound to the exact write, against real Postgres (item 8b, ported from Sally's
 * `chat-confirmation.integration.spec.ts`). Real HitlChallengeService, registry, HITL tiers, executor and pipeline;
 * role and plan are stubbed (covered by their own specs) and the audit log is a no-op.
 *
 * A Confirm for one write cannot be spent on a different tool, on the same tool with other arguments, in another
 * conversation, twice, after Cancel, or after a new message. Skipped when DATABASE_URL is unset or names no usable
 * database. Rows a run writes are deleted in afterAll (keyed on the fixture tool names).
 */
// No default: the spec writes rows, so it runs only against a database someone named.
const DATABASE_URL = process.env.DATABASE_URL;

const NOTE_TOOL = 'chat-confirm-fixture-note';
const DELETE_TOOL = 'chat-confirm-fixture-delete';
/** No real user: chat grant rows carry the person in `principal_id` only, so cleanup keys on the tool names. */
const USER_ID = 987_654;

const NO_DATABASE_CODES = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'P1000',
  'P1001',
  'P1003',
  'P1010',
  'P2021',
  'P2022',
]);

function isNoDatabase(err: unknown): boolean {
  const code = (err as { code?: string }).code;
  return code !== undefined && NO_DATABASE_CODES.has(code);
}

const noteSchema = z.object({ subject: z.string(), detail: z.object({ amount: z.number() }) });
const ran: string[] = [];

class NoteTool {
  @RequiresScope('platform:write')
  addNote(args: { subject: string; detail: { amount: number } }) {
    ran.push(`note:${args.subject}:${args.detail.amount}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
  }
}
class DeleteTool {
  @RequiresScope('platform:write:sensitive')
  remove() {
    ran.push('delete');
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }] };
  }
}

describe('chat confirmation is bound to the exact write (Postgres)', () => {
  let prisma: PrismaClient;
  let pool: pg.Pool;
  let pipeline: InvocationPipelineService;
  let challenges: HitlChallengeService;
  let tenantId: number;
  let dbReachable = false;
  const conversationId = `conv_it_${Date.now().toString(36)}`;
  let cardSeq = 0;

  beforeAll(async () => {
    if (!DATABASE_URL) {
      console.warn('chat-confirmation.integration: DATABASE_URL is unset — skipping');
      return;
    }
    try {
      pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });
      prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
      const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
      if (!tenant) {
        console.warn('chat-confirmation.integration: no tenant in the database — skipping');
        return;
      }
      // Fails with P2022 on a database without this PR's columns (not migrated): skip rather than fail.
      await prisma.hitlChallenge.count({ where: { conversationId } });
      tenantId = tenant.id;
      dbReachable = true;
    } catch (err) {
      if (!isNoDatabase(err)) throw err;
      console.warn(`chat-confirmation.integration: no usable database (${(err as Error).message}) — skipping`);
      return;
    }

    const instances = new Map<unknown, unknown>([
      [NoteTool, new NoteTool()],
      [DeleteTool, new DeleteTool()],
    ]);
    const mcpRegistry = {
      getMcpModuleIds: () => ['m'],
      getTools: () => [
        { metadata: { name: NOTE_TOOL, parameters: noteSchema }, providerClass: NoteTool, methodName: 'addNote' },
        {
          metadata: { name: DELETE_TOOL, parameters: z.object({ id: z.string() }) },
          providerClass: DeleteTool,
          methodName: 'remove',
        },
      ],
    } as unknown as McpRegistryDiscoveryService;
    const registry = new ScopeRegistryService(mcpRegistry);
    await registry.discoverTools();

    const events = { publish: async () => undefined } as unknown as DomainEventService;
    challenges = new HitlChallengeService(prisma as any, new OutboxService(prisma as any, events));
    const executor = new ToolExecutorService(
      registry,
      { get: (cls: unknown) => instances.get(cls) } as never,
      { user: { findUnique: async () => ({ userId: 'user_fixture' }) } } as never,
    );
    const audit = {
      writePending: async () => 'row',
      completeSuccess: async () => undefined,
      completeError: async () => undefined,
    };
    const allow = {
      actingRole: async () => 'OWNER',
      checkRole: () => null,
      checkPlan: async () => null,
    };
    pipeline = new InvocationPipelineService(
      registry,
      new HitlPolicyService(),
      executor,
      audit as never,
      challenges,
      allow as never,
    );
  }, 30_000);

  afterAll(async () => {
    if (dbReachable) {
      await prisma.hitlChallenge.deleteMany({ where: { toolName: { in: [NOTE_TOOL, DELETE_TOOL] } } });
    }
    await prisma?.$disconnect().catch(() => undefined);
    await pool?.end().catch(() => undefined);
  });

  beforeEach(() => {
    ran.length = 0;
  });

  const principal = (conversation = conversationId) =>
    fromUser({
      userId: USER_ID,
      tenantId,
      role: 'OWNER',
      scopes: ['platform:write', 'platform:write:sensitive'],
      conversationId: conversation,
    });
  const status = (res: { content: Array<{ text: string }> }) => JSON.parse(res.content[0].text).status;

  /** confirm-action raised a card for this write; returns its key. */
  const raiseCard = async (toolName: string, args: Record<string, unknown>, schema: unknown = noteSchema) => {
    const toolCallId = `call_${(cardSeq += 1)}`;
    await challenges.recordChatIntent({
      tenantId,
      userId: USER_ID,
      conversationId,
      toolCallId,
      toolName,
      argsDigest: intentDigest(schema, args),
      scopeRequired: 'platform:write',
    });
    return { tenantId, userId: USER_ID, conversationId, toolCallId };
  };

  const confirmed = { subject: 'Printer', detail: { amount: 5 } };

  it('runs only the write that was confirmed, once', async () => {
    if (!dbReachable) return;
    const card = await raiseCard(NOTE_TOOL, confirmed);

    // Before Confirm, nothing runs.
    expect(status(await pipeline.run(principal(), NOTE_TOOL, confirmed))).toBe('confirmation_required');

    expect(await challenges.confirmChatIntent(card)).toBe(true);
    // A second press grants nothing more.
    expect(await challenges.confirmChatIntent(card)).toBe(false);

    // In the same turn the model tries another tool, a changed nested value, and another conversation.
    expect(status(await pipeline.run(principal(), DELETE_TOOL, { id: 'x' }))).toBe('confirmation_required');
    expect(status(await pipeline.run(principal(), NOTE_TOOL, { subject: 'Printer', detail: { amount: 500 } }))).toBe(
      'confirmation_required',
    );
    expect(status(await pipeline.run(principal('conv_someone_else'), NOTE_TOOL, confirmed))).toBe(
      'confirmation_required',
    );
    expect(ran).toEqual([]);

    // The confirmed write runs (key order and `_` keys do not matter), and only once.
    const ok = await pipeline.run(principal(), NOTE_TOOL, { detail: { amount: 5 }, subject: 'Printer', _tenantId: 9 });
    expect(JSON.parse(ok.content[0].text)).toEqual({ success: true });
    expect(status(await pipeline.run(principal(), NOTE_TOOL, confirmed))).toBe('confirmation_required');
    expect(ran).toEqual(['note:Printer:5']);
  }, 30_000);

  it('Cancel voids the card: it can no longer be confirmed or spent', async () => {
    if (!dbReachable) return;
    const card = await raiseCard(NOTE_TOOL, confirmed);

    await challenges.declineChatIntent(card);

    expect(await challenges.confirmChatIntent(card)).toBe(false);
    expect(status(await pipeline.run(principal(), NOTE_TOOL, confirmed))).toBe('confirmation_required');
    expect(ran).toEqual([]);
  }, 30_000);

  it('the end of a resumed turn voids an unspent grant; a new message voids a waiting card', async () => {
    if (!dbReachable) return;
    const spentLater = await raiseCard(NOTE_TOOL, confirmed);
    expect(await challenges.confirmChatIntent(spentLater)).toBe(true);
    const waiting = await raiseCard(DELETE_TOOL, { id: 'x' }, z.object({ id: z.string() }));

    // The resumed turn ends without the write: the grant goes, the card it raised stays.
    await challenges.revokeChatGrants({ tenantId, userId: USER_ID, conversationId });
    expect(status(await pipeline.run(principal(), NOTE_TOOL, confirmed))).toBe('confirmation_required');
    const stillOpen = await prisma.hitlChallenge.findFirstOrThrow({
      where: { tenantId, conversationId, toolCallId: waiting.toolCallId },
    });
    expect(stillOpen.consumedAt).toBeNull();

    // A new message abandons the waiting card too.
    await challenges.revokeChatGrants({ tenantId, userId: USER_ID, conversationId, includePending: true });
    expect(await challenges.confirmChatIntent(waiting)).toBe(false);
    expect(ran).toEqual([]);
  }, 30_000);

  it('two racing calls on one grant: exactly one runs', async () => {
    if (!dbReachable) return;
    const card = await raiseCard(NOTE_TOOL, confirmed);
    expect(await challenges.confirmChatIntent(card)).toBe(true);

    const results = await Promise.all([
      pipeline.run(principal(), NOTE_TOOL, confirmed),
      pipeline.run(principal(), NOTE_TOOL, confirmed),
      pipeline.run(principal(), NOTE_TOOL, confirmed),
    ]);

    expect(results.filter((r) => status(r) === 'confirmation_required')).toHaveLength(2);
    expect(ran).toEqual(['note:Printer:5']);
  }, 30_000);

  it('a chat grant is not a challenge token: it cannot be replayed through consume or confirmed by a PIN step-up', async () => {
    if (!dbReachable) return;
    await raiseCard(NOTE_TOOL, confirmed);
    const row = await prisma.hitlChallenge.findFirstOrThrow({
      where: { tenantId, conversationId, toolName: NOTE_TOOL, consumedAt: null },
      orderBy: { id: 'desc' },
    });

    expect(await challenges.markStepUpCompleted(String(row.id), USER_ID)).toBe(false);
    expect(
      await challenges.consume(String(row.id), {
        tenantId,
        principalId: `user:${USER_ID}`,
        toolName: NOTE_TOOL,
        argsDigest: row.argsDigest,
      }),
    ).toBeNull();
  }, 30_000);
});
