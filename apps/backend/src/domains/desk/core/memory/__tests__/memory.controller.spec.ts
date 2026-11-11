import { UnauthorizedException } from '@nestjs/common';
import { readQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { fieldErrorsOf } from '@appshore/platform/test/helpers/field-errors.helpers';
import { MemoryListQueryDto } from '../dto/memory-list-query.dto';
// Stub PromptingService before any other import — its real implementation
// pulls in Langfuse (ESM), which Jest can't load without
// --experimental-vm-modules. The controller never touches PromptingService
// directly; it only flows through DeskMemoryWriterService at runtime, and
// these unit tests stub the writer entirely.
jest.mock('../../../../prompting/prompting.service', () => ({
  PromptingService: class MockPromptingService {},
}));

import { DeskMemoryController } from '../memory.controller';

/**
 * Controller-level wiring tests. The list endpoint backs both the Memory
 * tab (LLM-extracted memories) and the Rules tab (operator-authored
 * playbook entries) — same handler, different `authoredByOperatorOnly`
 * value. We assert the params flow through Zod parse into the service
 * call unchanged.
 */
class FakeMemoryService {
  listForUI = jest.fn().mockResolvedValue([]);
  setPinned = jest.fn();
  updateForTenant = jest.fn();
  softDelete = jest.fn();
}

class FakeWriter {
  write = jest.fn();
  writeOperatorRule = jest.fn();
}

class FakePrisma {}

const query = (raw: Record<string, unknown>) => readQueryDto(MemoryListQueryDto, raw);

describe('DeskMemoryController.list', () => {
  let controller: DeskMemoryController;
  let memories: FakeMemoryService;

  beforeEach(() => {
    memories = new FakeMemoryService();
    controller = new DeskMemoryController(new FakePrisma() as any, memories as any, new FakeWriter() as any);
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);
  });

  it('passes sourceEpisodeId through to the service when provided', async () => {
    await controller.list(
      { dbId: 1 },
      await query({ agent_key: 'assistant-dispatch', source_episode_id: '11111111-1111-1111-1111-111111111111' }),
    );
    expect(memories.listForUI).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        agentKey: 'assistant-dispatch',
        sourceEpisodeId: '11111111-1111-1111-1111-111111111111',
      }),
    );
  });

  it('leaves filters undefined when the query omits them', async () => {
    await controller.list({ dbId: 1 }, await query({ agent_key: 'assistant-dispatch' }));
    const call = memories.listForUI.mock.calls[0][0];
    expect(call.sourceEpisodeId).toBeUndefined();
    expect(call.scope).toBeUndefined();
    expect(call.polarity).toBeUndefined();
    expect(call.authoredByOperatorOnly).toBeUndefined();
    expect(call.agentKey).toBe('assistant-dispatch');
    // Default activeOnly=true per schema.
    expect(call.activeOnly).toBe(true);
  });

  it('returns { rows } shape', async () => {
    memories.listForUI.mockResolvedValueOnce([{ id: 'mem-1' }]);
    const result = await controller.list({ dbId: 1 }, await query({ agent_key: 'assistant-dispatch' }));
    expect(result).toEqual({ rows: [{ id: 'mem-1' }] });
  });

  it('Rules tab passes authoredByOperatorOnly=true; Memory tab passes false', async () => {
    await controller.list(
      { dbId: 1 },
      await query({ agent_key: 'assistant-dispatch', authored_by_operator_only: 'true' }),
    );
    expect(memories.listForUI.mock.calls[0][0].authoredByOperatorOnly).toBe(true);

    await controller.list(
      { dbId: 1 },
      await query({ agent_key: 'assistant-dispatch', authored_by_operator_only: 'false' }),
    );
    expect(memories.listForUI.mock.calls[1][0].authoredByOperatorOnly).toBe(false);
  });

  it('forwards scope + polarity filters', async () => {
    await controller.list(
      { dbId: 1 },
      await query({ agent_key: 'assistant-dispatch', scope: 'PLAYBOOK', polarity: 'REINFORCE' }),
    );
    const call = memories.listForUI.mock.calls[0][0];
    expect(call.scope).toBe('PLAYBOOK');
    expect(call.polarity).toBe('REINFORCE');
  });
});

describe('MemoryListQueryDto', () => {
  it('answers 400 with fieldErrors for a bad value (it was an uncaught ZodError)', async () => {
    expect(await fieldErrorsOf(query({ scope: 'nope' }))).toHaveProperty('scope');
    expect(await fieldErrorsOf(query({ source_episode_id: 'not-a-uuid' }))).toHaveProperty('source_episode_id');
    expect(await fieldErrorsOf(query({ active_only: 'maybe' }))).toHaveProperty('active_only');
    expect(await fieldErrorsOf(query({ limit: 'abc' }))).toHaveProperty('limit');
  });

  it('refuses the camelCase keys the route used to read', async () => {
    for (const key of ['agentKey', 'authoredByOperatorOnly', 'sourceEpisodeId', 'activeOnly']) {
      expect(await fieldErrorsOf(query({ [key]: 'true' }))).toHaveProperty(key);
    }
  });

  it('hides inactive memories unless active_only=false, and caps limit at 200', async () => {
    expect(await query({})).toMatchObject({ activeOnly: true, limit: 50 });
    expect(await query({ active_only: 'false', limit: '999' })).toMatchObject({ activeOnly: false, limit: 200 });
  });
});

describe('DeskMemoryController.setPinned', () => {
  let controller: DeskMemoryController;
  let memories: FakeMemoryService;

  beforeEach(() => {
    memories = new FakeMemoryService();
    controller = new DeskMemoryController(new FakePrisma() as any, memories as any, new FakeWriter() as any);
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);
  });

  it('forwards the pin toggle and returns the new state', async () => {
    const out = await controller.setPinned({ dbId: 1 }, '11111111-1111-1111-1111-111111111111', { isPinned: true });
    expect(memories.setPinned).toHaveBeenCalledWith({
      memoryId: '11111111-1111-1111-1111-111111111111',
      tenantId: 7,
      isPinned: true,
    });
    expect(out).toEqual({ id: '11111111-1111-1111-1111-111111111111', isPinned: true });
  });
});

describe('DeskMemoryController.addPlaybookRule', () => {
  it('answers 401 when the session carries no user id: no field of the request is at fault', async () => {
    const prisma = { deskAgent: { findFirst: jest.fn().mockResolvedValue({ id: 'agent-1' }) } };
    const writer = new FakeWriter();
    const controller = new DeskMemoryController(prisma as any, new FakeMemoryService() as any, writer as any);
    (controller as any).getTenantDbId = jest.fn().mockResolvedValue(7);

    await expect(
      controller.addPlaybookRule({}, { agentKey: 'assistant', content: 'Always confirm by phone' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(writer.writeOperatorRule).not.toHaveBeenCalled();
  });
});
