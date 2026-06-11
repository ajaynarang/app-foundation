import { AiPrismaService } from '../ai-prisma.service';

describe('AiPrismaService', () => {
  let service: AiPrismaService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      conversation: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, tenantId: 1 }]),
      },
    };

    mockPrisma = {
      $transaction: jest.fn((fn: any) => fn(mockTx)),
    };

    service = new AiPrismaService(mockPrisma);
  });

  describe('executeWithRlsContext', () => {
    it('should set RLS context before executing query', async () => {
      const result = await service.executeWithRlsContext(1, 10, 'member', async (tx) => tx.conversation.findMany());

      expect(result).toEqual([{ id: 1, tenantId: 1 }]);
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('should set tenant_id, user_role, user_id, AND SET LOCAL ROLE (4 calls)', async () => {
      await service.executeWithRlsContext(1, 42, 'member', async (tx) => tx.conversation.findMany());

      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(4);
    });

    it('should run the callback inside the same transaction', async () => {
      await service.executeWithRlsContext(7, 10, 'admin', async (tx) => tx.conversation.findMany());

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.conversation.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
