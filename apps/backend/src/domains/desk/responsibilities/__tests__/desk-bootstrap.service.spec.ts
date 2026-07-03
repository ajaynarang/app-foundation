import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';

import { DeskBootstrapService } from '../desk-bootstrap.service';

// We mock the lower-level function — DeskBootstrapService is just an
// adapter around it for NestJS lifecycle + per-tenant calls. The
// function's own behavior (upsert of 12 agents + 10 responsibilities) is
// covered by the seed's integration test.
jest.mock('../bootstrap-desk-for-tenant', () => ({
  bootstrapDeskForTenant: jest.fn().mockResolvedValue({
    agentsUpserted: 12,
    responsibilitiesUpserted: 10,
    supervisorBackfilled: 0,
  }),
}));

import { bootstrapDeskForTenant } from '../bootstrap-desk-for-tenant';

const mockBootstrap = bootstrapDeskForTenant as jest.MockedFunction<typeof bootstrapDeskForTenant>;

describe('DeskBootstrapService', () => {
  let service: DeskBootstrapService;
  let prismaMock: { tenant: { findMany: jest.Mock } };

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock = {
      tenant: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [DeskBootstrapService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();

    service = module.get<DeskBootstrapService>(DeskBootstrapService);
  });

  describe('sweepActiveTenants', () => {
    it('runs bootstrap for every ACTIVE tenant', async () => {
      prismaMock.tenant.findMany.mockResolvedValue([
        { id: 1, tenantId: 'TNT-001' },
        { id: 2, tenantId: 'TNT-002' },
        { id: 3, tenantId: 'TNT-003' },
      ]);

      const result = await service.sweepActiveTenants();

      expect(prismaMock.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
        select: { id: true, tenantId: true },
      });
      expect(mockBootstrap).toHaveBeenCalledTimes(3);
      expect(mockBootstrap).toHaveBeenCalledWith(prismaMock, 1);
      expect(mockBootstrap).toHaveBeenCalledWith(prismaMock, 2);
      expect(mockBootstrap).toHaveBeenCalledWith(prismaMock, 3);
      expect(result).toEqual({
        tenantsProcessed: 3,
        agentsUpserted: 36, // 12 × 3
        responsibilitiesUpserted: 30, // 10 × 3
        supervisorBackfilled: 0,
      });
    });

    it('continues the sweep when one tenant fails', async () => {
      prismaMock.tenant.findMany.mockResolvedValue([
        { id: 1, tenantId: 'TNT-001' },
        { id: 2, tenantId: 'TNT-BAD' },
        { id: 3, tenantId: 'TNT-003' },
      ]);
      mockBootstrap
        .mockResolvedValueOnce({ agentsUpserted: 12, responsibilitiesUpserted: 10, supervisorBackfilled: 0 })
        .mockRejectedValueOnce(new Error('DB connection dropped'))
        .mockResolvedValueOnce({ agentsUpserted: 12, responsibilitiesUpserted: 10, supervisorBackfilled: 0 });

      const result = await service.sweepActiveTenants();

      expect(mockBootstrap).toHaveBeenCalledTimes(3);
      expect(result.tenantsProcessed).toBe(3);
      expect(result.agentsUpserted).toBe(24); // 12 × 2 successful
      expect(result.responsibilitiesUpserted).toBe(20); // 10 × 2 successful
    });

    it('reports zero when no ACTIVE tenants exist', async () => {
      prismaMock.tenant.findMany.mockResolvedValue([]);

      const result = await service.sweepActiveTenants();

      expect(mockBootstrap).not.toHaveBeenCalled();
      expect(result).toEqual({
        tenantsProcessed: 0,
        agentsUpserted: 0,
        responsibilitiesUpserted: 0,
        supervisorBackfilled: 0,
      });
    });
  });

  describe('onModuleInit', () => {
    it('invokes sweepActiveTenants at startup', async () => {
      prismaMock.tenant.findMany.mockResolvedValue([{ id: 1, tenantId: 'TNT-001' }]);

      await service.onModuleInit();

      expect(mockBootstrap).toHaveBeenCalledWith(prismaMock, 1);
    });

    it('swallows sweep errors so they never block app startup', async () => {
      prismaMock.tenant.findMany.mockRejectedValue(new Error('DB down'));

      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('bootstrapForTenant', () => {
    it('calls the underlying bootstrap function with the tenant db id', async () => {
      await service.bootstrapForTenant(99);

      expect(mockBootstrap).toHaveBeenCalledWith(prismaMock, 99);
    });

    it('swallows bootstrap errors so a failed bootstrap never blocks tenant approval', async () => {
      mockBootstrap.mockRejectedValueOnce(new Error('DB transient'));

      await expect(service.bootstrapForTenant(99)).resolves.not.toThrow();
    });
  });
});
