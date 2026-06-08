import { Test } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ShieldController } from '../shield.controller';
import { ShieldService } from '../services/shield.service';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

describe('ShieldController', () => {
  let controller: ShieldController;
  let shieldService: any;
  let prisma: any;

  const mockUser = { tenantDbId: 1, dbId: 42, userId: 'u-1' };

  beforeEach(async () => {
    shieldService = {
      getInProgressAudit: jest.fn().mockResolvedValue(null),
      getLatestAudit: jest.fn().mockResolvedValue(null),
      getLastFailedAudit: jest.fn().mockResolvedValue(null),
      getNextScheduledAuditTime: jest.fn().mockReturnValue(new Date('2026-04-03T00:00:00Z')),
      getLatestScores: jest.fn().mockResolvedValue({ overall: 85 }),
      triggerAudit: jest.fn().mockResolvedValue({ auditId: 'aud-1' }),
      cancelAudit: jest.fn().mockResolvedValue({ cancelled: true, auditId: 'aud-1' }),
      getAuditHistory: jest.fn().mockResolvedValue({ audits: [], total: 0 }),
      getAuditById: jest.fn().mockResolvedValue(null),
      generateAuditPdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      getFindings: jest.fn().mockResolvedValue([]),
      bulkResolveFindings: jest.fn().mockResolvedValue({ count: 3 }),
      resolveFinding: jest.fn().mockResolvedValue({ resolved: true }),
      getCustomRules: jest.fn().mockResolvedValue([]),
      createCustomRule: jest.fn().mockResolvedValue({ id: 'r-1' }),
      updateCustomRule: jest.fn().mockResolvedValue({ id: 'r-1' }),
      deleteCustomRule: jest.fn().mockResolvedValue(undefined),
    };
    prisma = {
      fleetOperationsSettings: {
        findUnique: jest.fn().mockResolvedValue({
          shieldAiEnabled: true,
          shieldCustomRulesEnabled: true,
          shieldAuditPeriodDays: 30,
        }),
      },
    };

    const module = await Test.createTestingModule({
      controllers: [ShieldController],
      providers: [
        { provide: ShieldService, useValue: shieldService },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    controller = module.get(ShieldController);
  });

  describe('getLatestAudit', () => {
    it('should return hasAudit false when no audits exist', async () => {
      const result = await controller.getLatestAudit(mockUser);
      expect(result.hasAudit).toBe(false);
      expect(result.inProgress).toBe(false);
    });

    it('should return completed audit when available', async () => {
      const audit = { id: 'a-1', overallScore: 90 };
      shieldService.getLatestAudit.mockResolvedValue(audit);
      const result = await controller.getLatestAudit(mockUser);
      expect(result.hasAudit).toBe(true);
      expect(result.audit).toEqual(audit);
    });

    it('should show in-progress audit info', async () => {
      shieldService.getInProgressAudit.mockResolvedValue({
        id: 'a-2',
        status: 'IN_PROGRESS',
        scope: 'FULL',
        createdAt: new Date(),
      });
      const result = await controller.getLatestAudit(mockUser);
      expect(result.inProgress).toBe(true);
      expect(result.inProgressAudit).toBeDefined();
    });
  });

  describe('getScores', () => {
    it('should return scores', async () => {
      const result = await controller.getScores(mockUser);
      expect(result).toEqual({ overall: 85 });
    });
  });

  describe('triggerAudit', () => {
    it('should trigger audit with defaults from settings', async () => {
      const result = await controller.triggerAudit({}, mockUser);
      expect(result).toEqual({ auditId: 'aud-1' });
      expect(shieldService.triggerAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          scope: 'FULL',
          triggeredBy: 'MANUAL',
        }),
      );
    });

    it('should use dto overrides', async () => {
      await controller.triggerAudit({ scope: 'HOS', includeAi: false, auditPeriodDays: 7 }, mockUser);
      expect(shieldService.triggerAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'HOS',
          includeAi: false,
          auditPeriodDays: 7,
        }),
      );
    });
  });

  describe('getAuditHistory', () => {
    it('should parse limit and offset', async () => {
      await controller.getAuditHistory(mockUser, '10', '5');
      expect(shieldService.getAuditHistory).toHaveBeenCalledWith(1, 10, 5, undefined, undefined);
    });

    it('should default limit and offset', async () => {
      await controller.getAuditHistory(mockUser);
      expect(shieldService.getAuditHistory).toHaveBeenCalledWith(1, 20, 0, undefined, undefined);
    });

    it('should clamp limit to max 100', async () => {
      await controller.getAuditHistory(mockUser, '500');
      expect(shieldService.getAuditHistory).toHaveBeenCalledWith(1, 100, 0, undefined, undefined);
    });
  });

  describe('getAuditById', () => {
    it('should throw NotFoundException', async () => {
      await expect(controller.getAuditById('a-x', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should return audit', async () => {
      shieldService.getAuditById.mockResolvedValue({ id: 'a-1' });
      const result = await controller.getAuditById('a-1', mockUser);
      expect(result).toEqual({ id: 'a-1' });
    });
  });

  describe('exportAuditPdf', () => {
    it('should set PDF headers and send buffer', async () => {
      const res = { set: jest.fn(), send: jest.fn() };
      await controller.exportAuditPdf('a-1', mockUser, res as any);
      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Content-Type': 'application/pdf' }));
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('getFindings', () => {
    it('should throw on invalid category', async () => {
      await expect(controller.getFindings(mockUser, 'INVALID')).rejects.toThrow(BadRequestException);
    });

    it('should throw on invalid severity', async () => {
      await expect(controller.getFindings(mockUser, undefined, 'BAD')).rejects.toThrow(BadRequestException);
    });

    it('should pass valid filters', async () => {
      await controller.getFindings(mockUser, 'HOS', 'CRITICAL', 'true');
      expect(shieldService.getFindings).toHaveBeenCalledWith(1, {
        category: 'HOS',
        severity: 'CRITICAL',
        isResolved: true,
      });
    });
  });

  describe('bulkResolveFindings', () => {
    it('should return resolved count', async () => {
      const result = await controller.bulkResolveFindings({ findingIds: ['f-1', 'f-2'] }, mockUser);
      expect(result).toEqual({ resolved: 3 });
    });
  });

  describe('resolveFinding', () => {
    it('should delegate to service', async () => {
      const result = await controller.resolveFinding('f-1', mockUser);
      expect(result).toEqual({ resolved: true });
    });
  });

  describe('custom rules', () => {
    it('should get custom rules', async () => {
      await controller.getCustomRules(mockUser);
      expect(shieldService.getCustomRules).toHaveBeenCalledWith(1);
    });

    it('should create custom rule', async () => {
      const result = await controller.createCustomRule({ rule: 'test rule' }, mockUser);
      expect(result).toEqual({ id: 'r-1' });
    });

    it('should update custom rule', async () => {
      await controller.updateCustomRule('r-1', { rule: 'updated' } as any, mockUser);
      expect(shieldService.updateCustomRule).toHaveBeenCalledWith(1, 'r-1', {
        rule: 'updated',
      });
    });

    it('should delete custom rule', async () => {
      const result = await controller.deleteCustomRule('r-1', mockUser);
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('cancelAudit', () => {
    it('delegates to the service with tenant scope and audit id', async () => {
      const result = await controller.cancelAudit('aud-9', mockUser);

      expect(shieldService.cancelAudit).toHaveBeenCalledWith(1, 'aud-9');
      expect(result).toEqual({ cancelled: true, auditId: 'aud-1' });
    });

    it('propagates NotFoundException from the service', async () => {
      shieldService.cancelAudit.mockRejectedValueOnce(new NotFoundException('Audit not found'));

      await expect(controller.cancelAudit('missing', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('propagates BadRequestException when the audit already finished', async () => {
      shieldService.cancelAudit.mockRejectedValueOnce(new BadRequestException('This audit has already finished'));

      await expect(controller.cancelAudit('done', mockUser)).rejects.toThrow(BadRequestException);
    });
  });
});
