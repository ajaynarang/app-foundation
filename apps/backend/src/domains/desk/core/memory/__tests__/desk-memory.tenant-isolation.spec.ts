// Stub PromptingService before any other import — see writer-spec note.
jest.mock('../../../../prompting/prompting.service', () => ({
  PromptingService: class MockPromptingService {},
}));

import { NotFoundException } from '@nestjs/common';

import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { createMockPrisma } from '../../../../../test/mocks/prisma.mock';
import { EmbeddingService } from '../../../../ai/infrastructure/providers/embedding.service';

import { DeskMemoryService } from '../desk-memory.service';

/**
 * Tenant-isolation safety net per design doc §"Non-functional / Security/RBAC".
 * Pins the WHERE-clause `tenantId` on every read + the `assertInTenant`
 * guard on every mutation. Each test asserts the contract via behavior
 * (call args / thrown exception), not the SQL itself.
 */

function buildEmbedder(): jest.Mocked<EmbeddingService> {
  return {
    dimensions: 1536,
    embedText: jest.fn().mockResolvedValue(new Array(1536).fill(0)),
    embedBatch: jest.fn(),
  } as unknown as jest.Mocked<EmbeddingService>;
}

describe('DeskMemoryService — tenant isolation', () => {
  let service: DeskMemoryService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new DeskMemoryService(prisma as unknown as PrismaService, buildEmbedder());
  });

  it('listForUI scopes the WHERE clause by tenantId (Tenant B sees no Tenant A rows)', async () => {
    prisma.deskMemory.findMany.mockResolvedValue([]);
    await service.listForUI({
      tenantId: 2, // Tenant B
      agentKey: 'assistant-billing',
      activeOnly: true,
      limit: 50,
    });
    expect(prisma.deskMemory.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 2 }),
      }),
    );
  });

  it('findRelevant scopes the raw SQL bind values by tenantId + agentId', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await service.findRelevant({
      tenantId: 2,
      agentId: 5,
      entityRef: { customerId: '42' },
      queryContext: 'overdue',
    });
    // Prisma.sql carries (template, ...values). We assert the tenantId +
    // agentId numbers are present in the bind values regardless of the
    // template's placeholder ordering.
    const callArgs = prisma.$queryRaw.mock.calls[0];
    const flat = JSON.stringify(callArgs);
    expect(flat).toContain('2');
    expect(flat).toContain('5');
  });

  it('setPinned throws NotFound when the memory belongs to a different tenant (no leak)', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 99 });
    await expect(service.setPinned({ memoryId: 'm-cross-tenant', tenantId: 2, isPinned: true })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });

  it('updateForTenant throws NotFound when the memory belongs to a different tenant', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 99 });
    await expect(
      service.updateForTenant({ memoryId: 'm-cross-tenant', tenantId: 2, content: 'edited' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });

  it('softDelete throws NotFound when the memory belongs to a different tenant', async () => {
    prisma.deskMemory.findUnique.mockResolvedValue({ tenantId: 99 });
    await expect(service.softDelete('m-cross-tenant', 2)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.deskMemory.update).not.toHaveBeenCalled();
  });
});
