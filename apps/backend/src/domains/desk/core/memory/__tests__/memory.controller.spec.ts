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
      'sally-dispatch',
      undefined,
      undefined,
      undefined,
      '11111111-1111-1111-1111-111111111111',
    );
    expect(memories.listForUI).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 7,
        agentKey: 'sally-dispatch',
        sourceEpisodeId: '11111111-1111-1111-1111-111111111111',
      }),
    );
  });

  it('leaves filters undefined when the query omits them', async () => {
    await controller.list({ dbId: 1 }, 'sally-dispatch');
    const call = memories.listForUI.mock.calls[0][0];
    expect(call.sourceEpisodeId).toBeUndefined();
    expect(call.scope).toBeUndefined();
    expect(call.polarity).toBeUndefined();
    expect(call.authoredByOperatorOnly).toBeUndefined();
    expect(call.agentKey).toBe('sally-dispatch');
    // Default activeOnly=true per schema.
    expect(call.activeOnly).toBe(true);
  });

  it('returns { rows } shape', async () => {
    memories.listForUI.mockResolvedValueOnce([{ id: 'mem-1' }]);
    const result = await controller.list({ dbId: 1 }, 'sally-dispatch');
    expect(result).toEqual({ rows: [{ id: 'mem-1' }] });
  });

  it('Rules tab passes authoredByOperatorOnly=true; Memory tab passes false', async () => {
    await controller.list({ dbId: 1 }, 'sally-dispatch', undefined, undefined, 'true');
    expect(memories.listForUI.mock.calls[0][0].authoredByOperatorOnly).toBe(true);

    await controller.list({ dbId: 1 }, 'sally-dispatch', undefined, undefined, 'false');
    expect(memories.listForUI.mock.calls[1][0].authoredByOperatorOnly).toBe(false);
  });

  it('forwards scope + polarity filters', async () => {
    await controller.list({ dbId: 1 }, 'sally-dispatch', 'PLAYBOOK', 'REINFORCE');
    const call = memories.listForUI.mock.calls[0][0];
    expect(call.scope).toBe('PLAYBOOK');
    expect(call.polarity).toBe('REINFORCE');
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
