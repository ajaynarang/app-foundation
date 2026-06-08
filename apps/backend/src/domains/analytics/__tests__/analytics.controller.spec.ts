import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from '../analytics.controller';
import { KpiDashboardService } from '../services/kpi-dashboard.service';
import { RevenueReportService } from '../services/revenue-report.service';
import { ProfitabilityReportService } from '../services/profitability-report.service';
import { DriverPerformanceService } from '../services/driver-performance.service';
import { FleetUtilizationService } from '../services/fleet-utilization.service';
import { CustomerScorecardService } from '../services/customer-scorecard.service';
import { LaneAnalysisService } from '../services/lane-analysis.service';
import { ArAgingService } from '../services/ar-aging.service';
import { ReportExportService } from '../services/report-export.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;

  const mockUser = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    dbId: 1,
    role: 'DISPATCHER',
  };

  const mockTenant = { id: 1, tenantId: 'tenant-1' };

  const mockPrisma = {
    tenant: { findUnique: jest.fn().mockResolvedValue(mockTenant) },
  };

  const mockKpiService = { getKpis: jest.fn() };
  const mockRevenueService = {
    getRevenueSummary: jest.fn(),
    getRevenueByCustomer: jest.fn(),
  };
  const mockProfitabilityService = {
    getProfitabilityTrend: jest.fn(),
    getProfitabilityByLoad: jest.fn(),
  };
  const mockDriverPerfService = { getDriverPerformance: jest.fn() };
  const mockFleetUtilService = { getFleetUtilization: jest.fn() };
  const mockCustomerScorecardService = { getCustomerScorecard: jest.fn() };
  const mockLaneAnalysisService = { getLaneAnalysis: jest.fn() };
  const mockArAgingService = { getArAging: jest.fn() };
  const mockReportExportService = {
    exportCsv: jest.fn(),
    exportPdf: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: KpiDashboardService, useValue: mockKpiService },
        { provide: RevenueReportService, useValue: mockRevenueService },
        {
          provide: ProfitabilityReportService,
          useValue: mockProfitabilityService,
        },
        { provide: DriverPerformanceService, useValue: mockDriverPerfService },
        { provide: FleetUtilizationService, useValue: mockFleetUtilService },
        {
          provide: CustomerScorecardService,
          useValue: mockCustomerScorecardService,
        },
        { provide: LaneAnalysisService, useValue: mockLaneAnalysisService },
        { provide: ArAgingService, useValue: mockArAgingService },
        { provide: ReportExportService, useValue: mockReportExportService },
      ],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /kpi', () => {
    it('should return KPI dashboard', async () => {
      const kpis = { activeLoads: 10, revenue: 50000 };
      mockKpiService.getKpis.mockResolvedValue(kpis);

      const result = await controller.getKpiDashboard(mockUser);
      expect(mockKpiService.getKpis).toHaveBeenCalledWith(1);
      expect(result).toEqual(kpis);
    });
  });

  describe('GET /reports/revenue', () => {
    it('should return normalized revenue report', async () => {
      mockRevenueService.getRevenueSummary.mockResolvedValue({
        totalRevenueCents: 100000,
        totalLoadCount: 10,
        avgRatePerMileCents: 250,
        periods: [{ period: '2026-01-01', revenueCents: 50000 }],
      });
      mockRevenueService.getRevenueByCustomer.mockResolvedValue([{ companyName: 'Acme', revenueCents: 100000 }]);

      const result = await controller.getRevenueReport(mockUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(result.summary).toHaveProperty('totalRevenueCents');
      expect(result.timeSeries).toHaveLength(1);
      expect(result.table).toHaveLength(1);
      expect(result.columns).toBeDefined();
    });
  });

  describe('GET /reports/profitability', () => {
    it('should return normalized profitability report', async () => {
      mockProfitabilityService.getProfitabilityTrend.mockResolvedValue({
        totalRevenueCents: 100000,
        totalCostsCents: 60000,
        totalMarginCents: 40000,
        overallMarginPercent: 40,
        periods: [{ period: '2026-01-01', marginPercent: 42 }],
      });
      mockProfitabilityService.getProfitabilityByLoad.mockResolvedValue([{ loadNumber: 'L001', marginPercent: 42 }]);

      const result = await controller.getProfitabilityReport(mockUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(result.summary).toHaveProperty('totalMarginCents');
      expect(result.timeSeries).toHaveLength(1);
    });
  });

  describe('GET /reports/drivers', () => {
    it('should return driver performance report', async () => {
      mockDriverPerfService.getDriverPerformance.mockResolvedValue([
        {
          driverName: 'John',
          loadsCompleted: 5,
          revenueCents: 25000,
          earningsCents: 5000,
          onTimePercent: 95,
          totalMiles: 2000,
        },
      ]);

      const result = await controller.getDriverPerformance(mockUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(result.summary.totalDrivers).toBe(1);
      expect(result.summary.totalLoadsCompleted).toBe(5);
    });
  });

  describe('GET /reports/fleet', () => {
    it('should return fleet utilization report', async () => {
      mockFleetUtilService.getFleetUtilization.mockResolvedValue([
        {
          unitNumber: 'T-101',
          loadCount: 3,
          totalMiles: 1500,
          revenueCents: 15000,
          revenuePerMileCents: 1000,
        },
      ]);

      const result = await controller.getFleetUtilization(mockUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(result.summary.totalVehicles).toBe(1);
      expect(result.summary.totalMiles).toBe(1500);
    });
  });

  describe('GET /reports/customers', () => {
    it('should return customer scorecard', async () => {
      mockCustomerScorecardService.getCustomerScorecard.mockResolvedValue([
        {
          companyName: 'Acme',
          loadCount: 10,
          revenueCents: 50000,
          avgPayDays: 30,
          outstandingCents: 10000,
          onTimeDeliveryPercent: 90,
        },
      ]);

      const result = await controller.getCustomerScorecard(mockUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(result.summary.totalCustomers).toBe(1);
      expect(result.summary.totalRevenueCents).toBe(50000);
    });
  });

  describe('GET /reports/lanes', () => {
    it('should return lane analysis', async () => {
      mockLaneAnalysisService.getLaneAnalysis.mockResolvedValue([
        {
          originCity: 'Dallas',
          originState: 'TX',
          destinationCity: 'Houston',
          destinationState: 'TX',
          loadCount: 5,
          totalRevenueCents: 25000,
          avgRatePerMileCents: 300,
          avgTransitHours: 4,
        },
      ]);

      const result = await controller.getLaneAnalysis(mockUser, {
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
      } as any);

      expect(result.summary.totalLanes).toBe(1);
    });
  });

  describe('GET /reports/ar-aging', () => {
    it('should return AR aging report', async () => {
      mockArAgingService.getArAging.mockResolvedValue({
        totalOutstandingCents: 50000,
        totalOverdueCents: 10000,
        buckets: [{ label: '0-30', count: 5, totalCents: 30000 }],
        byCustomer: [{ companyName: 'Acme' }],
      });

      const result = await controller.getArAging(mockUser);
      expect(result.summary.totalOutstandingCents).toBe(50000);
      expect(result.timeSeries).toHaveLength(1);
    });
  });
});
