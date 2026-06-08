import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { KpiDashboardService } from './services/kpi-dashboard.service';
import { RevenueReportService } from './services/revenue-report.service';
import { ProfitabilityReportService } from './services/profitability-report.service';
import { DriverPerformanceService } from './services/driver-performance.service';
import { FleetUtilizationService } from './services/fleet-utilization.service';
import { CustomerScorecardService } from './services/customer-scorecard.service';
import { LaneAnalysisService } from './services/lane-analysis.service';
import { ArAgingService } from './services/ar-aging.service';
import { ReportExportService } from './services/report-export.service';
import { PrismaModule } from '../../infrastructure/database/prisma.module';
import { CacheModule } from '../../infrastructure/cache/cache.module';

@Module({
  imports: [PrismaModule, CacheModule],
  controllers: [AnalyticsController],
  providers: [
    KpiDashboardService,
    RevenueReportService,
    ProfitabilityReportService,
    DriverPerformanceService,
    FleetUtilizationService,
    CustomerScorecardService,
    LaneAnalysisService,
    ArAgingService,
    ReportExportService,
  ],
  exports: [KpiDashboardService, ReportExportService],
})
export class AnalyticsModule {}
