import { Test, TestingModule } from '@nestjs/testing';
import { AlertDigestService } from '../alert-digest.service';
import { PrismaService } from '../../../../../infrastructure/database/prisma.service';
import { EmailService } from '../../../../../infrastructure/notification/services/email.service';
import { AlertAnalyticsService } from '../alert-analytics.service';
import { TimezoneService } from '../../../../../shared/services/timezone.service';
import { TenantJobRunService } from '../../../../../shared/services/tenant-job-run.service';
import { DIGEST_LOCAL_HOUR, TENANT_JOB_KEYS } from '../../../../../shared/constants/scheduling.constants';

describe('AlertDigestService', () => {
  let service: AlertDigestService;

  const mockPrisma = {
    user: { findMany: jest.fn() },
    tenant: { findMany: jest.fn(), update: jest.fn() },
    alert: { findMany: jest.fn(), count: jest.fn() },
  };
  const mockEmail = { sendEmail: jest.fn() };
  const mockAnalytics = {
    getResolutionRates: jest.fn().mockResolvedValue({
      total: 10,
      resolved: 8,
      autoResolved: 1,
      escalated: 1,
      resolutionRate: 90,
      escalationRate: 10,
    }),
    getVolumeByCategory: jest.fn().mockResolvedValue([{ category: 'compliance', count: 5 }]),
  };
  const mockTimezone = {
    resolveTenantTimezone: jest.fn().mockResolvedValue('UTC'),
    localHour: jest.fn().mockReturnValue(DIGEST_LOCAL_HOUR),
    localDate: jest.fn().mockReturnValue('2026-05-29'),
  };
  const mockTenantJobRun = {
    hasRunOn: jest.fn().mockResolvedValue(false),
    markRanOn: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertDigestService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmail },
        { provide: AlertAnalyticsService, useValue: mockAnalytics },
        { provide: TimezoneService, useValue: mockTimezone },
        { provide: TenantJobRunService, useValue: mockTenantJobRun },
      ],
    }).compile();

    service = module.get<AlertDigestService>(AlertDigestService);
    jest.clearAllMocks();
    // Sensible defaults: local 8 AM, never previously stamped.
    mockTimezone.resolveTenantTimezone.mockResolvedValue('UTC');
    mockTimezone.localHour.mockReturnValue(DIGEST_LOCAL_HOUR);
    mockTimezone.localDate.mockReturnValue('2026-05-29');
    mockTenantJobRun.hasRunOn.mockResolvedValue(false);
    mockTenantJobRun.markRanOn.mockResolvedValue(undefined);
  });

  describe('generateDailyDigest', () => {
    it('should generate digest for each tenant with dispatchers', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Test Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([{ email: 'dispatcher@test.com', firstName: 'John' }]);
      mockPrisma.alert.findMany.mockResolvedValue([]);
      mockPrisma.alert.count.mockResolvedValue(3);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).toHaveBeenCalled();
    });

    it('should skip tenants with no dispatchers', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Empty Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should send email to multiple dispatchers', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Multi Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([
        { email: 'disp1@test.com', firstName: 'Alice' },
        { email: 'disp2@test.com', firstName: 'Bob' },
      ]);
      mockPrisma.alert.count.mockResolvedValue(5);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should handle errors per tenant gracefully', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 1, companyName: 'Error Corp' },
        { id: 2, companyName: 'OK Corp' },
      ]);
      // First tenant: throw error
      mockPrisma.user.findMany
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce([{ email: 'ok@test.com', firstName: 'Good' }]);
      mockPrisma.alert.count.mockResolvedValue(1);

      // Should not throw
      await service.generateDailyDigest();

      // Second tenant should still be processed
      expect(mockEmail.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple tenants', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 1, companyName: 'Corp A' },
        { id: 2, companyName: 'Corp B' },
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{ email: 'a@test.com', firstName: 'A' }]);
      mockPrisma.alert.count.mockResolvedValue(2);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateDailyDigest — tenant-local 8 AM gating', () => {
    const localToday = '2026-05-29';

    beforeEach(() => {
      mockPrisma.user.findMany.mockResolvedValue([{ email: 'dispatcher@test.com', firstName: 'John' }]);
      mockPrisma.alert.count.mockResolvedValue(3);
    });

    it('sends + stamps tenant A (local 8 AM, never run); skips tenant B (already run today) and tenant C (local 9 AM)', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 1, companyName: 'Corp A' },
        { id: 2, companyName: 'Corp B' },
        { id: 3, companyName: 'Corp C' },
      ]);
      // Per-tenant timezone resolution.
      mockTimezone.resolveTenantTimezone.mockImplementation((id: number) =>
        Promise.resolve(id === 1 ? 'America/Chicago' : id === 2 ? 'America/New_York' : 'America/Denver'),
      );
      // Tenant A + B are at local 8 AM; tenant C is at local 9 AM (skipped on hour).
      mockTimezone.localHour.mockImplementation((tz: string) =>
        tz === 'America/Denver' ? DIGEST_LOCAL_HOUR + 1 : DIGEST_LOCAL_HOUR,
      );
      mockTimezone.localDate.mockReturnValue(localToday);
      // Tenant A never run; tenant B already stamped today.
      mockTenantJobRun.hasRunOn.mockImplementation((tenantId: number) => Promise.resolve(tenantId === 2));

      await service.generateDailyDigest();

      // Only tenant A sends.
      expect(mockEmail.sendEmail).toHaveBeenCalledTimes(1);
      // Only tenant A stamped.
      expect(mockTenantJobRun.markRanOn).toHaveBeenCalledTimes(1);
      expect(mockTenantJobRun.markRanOn).toHaveBeenCalledWith(1, TENANT_JOB_KEYS.ALERT_DIGEST, localToday);
    });

    it('skips a tenant whose local hour is not the digest hour', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Corp A' }]);
      mockTimezone.localHour.mockReturnValue(DIGEST_LOCAL_HOUR - 1);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
      expect(mockTenantJobRun.markRanOn).not.toHaveBeenCalled();
    });

    it('skips a tenant already stamped for the local day', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Corp A' }]);
      mockTimezone.localHour.mockReturnValue(DIGEST_LOCAL_HOUR);
      mockTimezone.localDate.mockReturnValue(localToday);
      mockTenantJobRun.hasRunOn.mockResolvedValue(true);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
      expect(mockTenantJobRun.markRanOn).not.toHaveBeenCalled();
    });

    it('sends + stamps when stamp is an earlier local day', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Corp A' }]);
      mockTimezone.localHour.mockReturnValue(DIGEST_LOCAL_HOUR);
      mockTimezone.localDate.mockReturnValue(localToday);
      // Stamp is from an earlier local day → hasRunOn(localToday) is false.
      mockTenantJobRun.hasRunOn.mockResolvedValue(false);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).toHaveBeenCalledTimes(1);
      expect(mockTenantJobRun.markRanOn).toHaveBeenCalledWith(1, TENANT_JOB_KEYS.ALERT_DIGEST, localToday);
    });

    it('does not stamp when the tenant has no dispatchers', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Corp A' }]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      mockTimezone.localHour.mockReturnValue(DIGEST_LOCAL_HOUR);

      await service.generateDailyDigest();

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
      expect(mockTenantJobRun.markRanOn).not.toHaveBeenCalled();
    });
  });

  describe('generateShiftSummary', () => {
    it('should generate shift summary with unresolved alerts', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Test Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([{ email: 'dispatcher@test.com', firstName: 'John' }]);
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          alertId: 'ALT-1',
          alertType: 'HOS_VIOLATION',
          priority: 'critical',
          title: 'HOS Violation',
          status: 'active',
          driverId: 'DRV-1',
        },
      ]);

      await service.generateShiftSummary();

      expect(mockEmail.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'dispatcher@test.com',
          subject: expect.stringContaining('Shift Handoff'),
        }),
      );
    });

    it('should skip tenants with no dispatchers', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Empty Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([]);

      await service.generateShiftSummary();

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should skip tenants with no unresolved alerts', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Clean Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([{ email: 'dispatcher@test.com', firstName: 'John' }]);
      mockPrisma.alert.findMany.mockResolvedValue([]);

      await service.generateShiftSummary();

      expect(mockEmail.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle errors per tenant gracefully', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Error Corp' }]);
      mockPrisma.user.findMany.mockRejectedValue(new Error('DB fail'));

      // Should not throw
      await service.generateShiftSummary();
    });

    it('should send to multiple dispatchers', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: 1, companyName: 'Corp' }]);
      mockPrisma.user.findMany.mockResolvedValue([
        { email: 'a@test.com', firstName: 'A' },
        { email: 'b@test.com', firstName: 'B' },
      ]);
      mockPrisma.alert.findMany.mockResolvedValue([
        {
          priority: 'high',
          title: 'Alert',
          status: 'active',
          driverId: 'DRV-1',
        },
      ]);

      await service.generateShiftSummary();

      expect(mockEmail.sendEmail).toHaveBeenCalledTimes(2);
    });
  });
});
