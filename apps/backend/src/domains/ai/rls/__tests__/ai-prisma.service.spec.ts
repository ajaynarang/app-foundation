import { AiPrismaService } from '../ai-prisma.service';

describe('AiPrismaService', () => {
  let service: AiPrismaService;
  let mockPrisma: any;
  let mockTx: any;

  beforeEach(() => {
    mockTx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      load: {
        findMany: jest.fn().mockResolvedValue([{ id: 1, status: 'active' }]),
      },
    };

    mockPrisma = {
      $transaction: jest.fn((fn: any) => fn(mockTx)),
    };

    service = new AiPrismaService(mockPrisma);
  });

  describe('executeWithRlsContext', () => {
    it('should set tenant context before executing query', async () => {
      const result = await service.executeWithRlsContext(1, 10, 'dispatcher', async (tx) => tx.load.findMany());

      expect(result).toEqual([{ id: 1, status: 'active' }]);
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('should set driver context for driver persona', async () => {
      await service.executeWithRlsContext(1, 42, 'driver', async (tx) => tx.load.findMany());

      // Should have set tenant_id, user_role, driver_id, AND SET LOCAL ROLE
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(4);
    });

    it('should not set driver_id for non-driver persona', async () => {
      await service.executeWithRlsContext(1, 10, 'dispatcher', async (tx) => tx.load.findMany());

      // Should have set tenant_id, user_role, AND SET LOCAL ROLE (3 calls)
      expect(mockTx.$executeRaw).toHaveBeenCalledTimes(3);
    });
  });
});
