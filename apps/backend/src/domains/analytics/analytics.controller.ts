import { Controller, Get, Param, Query, Res, Logger, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { RequireFeature } from '../../auth/decorators/require-feature.decorator';
import { FEATURE_KEYS } from '@sally/shared-types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { BaseTenantController } from '../../shared/base/base-tenant.controller';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { KpiDashboardService } from './services/kpi-dashboard.service';
import { RevenueReportService } from './services/revenue-report.service';
import { ProfitabilityReportService } from './services/profitability-report.service';
import { DriverPerformanceService } from './services/driver-performance.service';
import { FleetUtilizationService } from './services/fleet-utilization.service';
import { CustomerScorecardService } from './services/customer-scorecard.service';
import { LaneAnalysisService } from './services/lane-analysis.service';
import { ArAgingService } from './services/ar-aging.service';
import { ReportExportService } from './services/report-export.service';
import { ReportQueryDto, GroupByPeriod } from './dto/report-query.dto';

/**
 * Normalized report response matching frontend ReportData interface.
 * Every GET /analytics/reports/:type endpoint returns this shape.
 */
interface ReportData {
  summary: Record<string, number>;
  timeSeries?: { period: string; value: number; label?: string }[];
  table?: Record<string, unknown>[];
  columns?: { key: string; label: string; format?: string }[];
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
@RequireFeature(FEATURE_KEYS.INSIGHTS)
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
export class AnalyticsController extends BaseTenantController {
  private readonly logger = new Logger(AnalyticsController.name);

  constructor(
    prisma: PrismaService,
    private readonly kpiDashboardService: KpiDashboardService,
    private readonly revenueReportService: RevenueReportService,
    private readonly profitabilityReportService: ProfitabilityReportService,
    private readonly driverPerformanceService: DriverPerformanceService,
    private readonly fleetUtilizationService: FleetUtilizationService,
    private readonly customerScorecardService: CustomerScorecardService,
    private readonly laneAnalysisService: LaneAnalysisService,
    private readonly arAgingService: ArAgingService,
    private readonly reportExportService: ReportExportService,
  ) {
    super(prisma);
  }

  // ─── KPI Dashboard ──────────────────────────────────────────────

  @Get('kpi')
  @ApiOperation({ summary: 'Get real-time KPI dashboard strip' })
  async getKpiDashboard(@CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.kpiDashboardService.getKpis(tenantDbId);
  }

  // ─── Unified Report Endpoints (normalized to ReportData) ───────

  @Get('reports/revenue')
  @ApiOperation({ summary: 'Get revenue summary report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'groupBy', required: false, enum: GroupByPeriod })
  async getRevenueReport(@CurrentUser() user: any, @Query() query: ReportQueryDto): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const groupBy = query.groupBy ?? GroupByPeriod.DAY;

    const [summary, byCustomer] = await Promise.all([
      this.revenueReportService.getRevenueSummary(tenantDbId, dateFrom, dateTo, groupBy),
      this.revenueReportService.getRevenueByCustomer(tenantDbId, dateFrom, dateTo, 50),
    ]);

    return {
      summary: {
        totalRevenueCents: summary.totalRevenueCents,
        totalLoadCount: summary.totalLoadCount,
        avgRatePerMileCents: summary.avgRatePerMileCents,
      },
      timeSeries: summary.periods.map((p) => ({
        period: p.period,
        value: p.revenueCents,
        label: p.period,
      })),
      table: byCustomer.map((c) => ({ ...c })),
      columns: [
        { key: 'companyName', label: 'Customer', format: 'text' },
        { key: 'revenueCents', label: 'Revenue', format: 'currency' },
        { key: 'loadCount', label: 'Loads', format: 'number' },
        {
          key: 'avgRatePerMileCents',
          label: 'Avg Rate/Mile',
          format: 'currency',
        },
      ],
    };
  }

  @Get('reports/profitability')
  @ApiOperation({ summary: 'Get profitability report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'groupBy', required: false, enum: GroupByPeriod })
  @ApiQuery({ name: 'limit', required: false })
  async getProfitabilityReport(@CurrentUser() user: any, @Query() query: ReportQueryDto): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const groupBy = query.groupBy ?? GroupByPeriod.DAY;

    const [trend, byLoad] = await Promise.all([
      this.profitabilityReportService.getProfitabilityTrend(tenantDbId, dateFrom, dateTo, groupBy),
      this.profitabilityReportService.getProfitabilityByLoad(tenantDbId, dateFrom, dateTo, query.limit ?? 50),
    ]);

    return {
      summary: {
        totalRevenueCents: trend.totalRevenueCents,
        totalCostsCents: trend.totalCostsCents,
        totalMarginCents: trend.totalMarginCents,
        overallMarginPercent: trend.overallMarginPercent,
      },
      timeSeries: trend.periods.map((p) => ({
        period: p.period,
        value: p.marginPercent,
        label: p.period,
      })),
      table: byLoad.map((l) => ({ ...l })),
      columns: [
        { key: 'loadNumber', label: 'Load #', format: 'text' },
        { key: 'customerName', label: 'Customer', format: 'text' },
        { key: 'revenueCents', label: 'Revenue', format: 'currency' },
        { key: 'totalCostCents', label: 'Costs', format: 'currency' },
        { key: 'marginCents', label: 'Margin', format: 'currency' },
        { key: 'marginPercent', label: 'Margin %', format: 'percent' },
      ],
    };
  }

  @Get('reports/drivers')
  @ApiOperation({ summary: 'Get driver performance report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getDriverPerformance(@CurrentUser() user: any, @Query() query: ReportQueryDto): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const rows = await this.driverPerformanceService.getDriverPerformance(tenantDbId, dateFrom, dateTo, query.limit);

    const totalLoads = rows.reduce((s, r) => s + r.loadsCompleted, 0);
    const totalRevenue = rows.reduce((s, r) => s + r.revenueCents, 0);

    return {
      summary: {
        totalDrivers: rows.length,
        totalLoadsCompleted: totalLoads,
        totalRevenueCents: totalRevenue,
      },
      timeSeries: rows.map((r) => ({
        period: r.driverName,
        value: r.loadsCompleted,
      })),
      table: rows.map((r) => ({ ...r })),
      columns: [
        { key: 'driverName', label: 'Driver', format: 'text' },
        { key: 'loadsCompleted', label: 'Loads', format: 'number' },
        { key: 'revenueCents', label: 'Revenue', format: 'currency' },
        { key: 'earningsCents', label: 'Earnings', format: 'currency' },
        { key: 'onTimePercent', label: 'On-Time %', format: 'percent' },
        { key: 'totalMiles', label: 'Miles', format: 'number' },
      ],
    };
  }

  @Get('reports/fleet')
  @ApiOperation({ summary: 'Get fleet utilization report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getFleetUtilization(@CurrentUser() user: any, @Query() query: ReportQueryDto): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const rows = await this.fleetUtilizationService.getFleetUtilization(tenantDbId, dateFrom, dateTo, query.limit);

    const totalMiles = rows.reduce((s, r) => s + r.totalMiles, 0);
    const totalLoads = rows.reduce((s, r) => s + r.loadCount, 0);

    return {
      summary: {
        totalVehicles: rows.length,
        totalLoadCount: totalLoads,
        totalMiles,
      },
      timeSeries: rows.map((r) => ({
        period: r.unitNumber,
        value: r.loadCount,
      })),
      table: rows.map((r) => ({ ...r })),
      columns: [
        { key: 'unitNumber', label: 'Unit #', format: 'text' },
        { key: 'type', label: 'Type', format: 'text' },
        { key: 'loadCount', label: 'Loads', format: 'number' },
        { key: 'totalMiles', label: 'Miles', format: 'number' },
        { key: 'revenueCents', label: 'Revenue', format: 'currency' },
        { key: 'revenuePerMileCents', label: 'Rev/Mile', format: 'currency' },
      ],
    };
  }

  @Get('reports/customers')
  @ApiOperation({ summary: 'Get customer scorecard report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getCustomerScorecard(@CurrentUser() user: any, @Query() query: ReportQueryDto): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const rows = await this.customerScorecardService.getCustomerScorecard(tenantDbId, dateFrom, dateTo, query.limit);

    const totalRevenue = rows.reduce((s, r) => s + r.revenueCents, 0);
    const totalOutstanding = rows.reduce((s, r) => s + r.outstandingCents, 0);

    return {
      summary: {
        totalCustomers: rows.length,
        totalRevenueCents: totalRevenue,
        totalOutstandingCents: totalOutstanding,
      },
      timeSeries: rows.slice(0, 10).map((r) => ({
        period: r.companyName,
        value: r.revenueCents,
      })),
      table: rows.map((r) => ({ ...r })),
      columns: [
        { key: 'companyName', label: 'Customer', format: 'text' },
        { key: 'loadCount', label: 'Loads', format: 'number' },
        { key: 'revenueCents', label: 'Revenue', format: 'currency' },
        { key: 'avgPayDays', label: 'Avg Pay Days', format: 'number' },
        { key: 'outstandingCents', label: 'Outstanding', format: 'currency' },
        { key: 'onTimeDeliveryPercent', label: 'On-Time %', format: 'percent' },
      ],
    };
  }

  @Get('reports/lanes')
  @ApiOperation({ summary: 'Get lane analysis report' })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async getLaneAnalysis(@CurrentUser() user: any, @Query() query: ReportQueryDto): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const rows = await this.laneAnalysisService.getLaneAnalysis(tenantDbId, dateFrom, dateTo, query.limit);

    const totalRevenue = rows.reduce((s, r) => s + r.totalRevenueCents, 0);

    return {
      summary: {
        totalLanes: rows.length,
        totalRevenueCents: totalRevenue,
      },
      timeSeries: rows.slice(0, 10).map((r) => ({
        period: `${r.originCity} → ${r.destinationCity}`,
        value: r.totalRevenueCents,
      })),
      table: rows.map((r) => ({
        lane: `${r.originCity}, ${r.originState} → ${r.destinationCity}, ${r.destinationState}`,
        loadCount: r.loadCount,
        totalRevenueCents: r.totalRevenueCents,
        avgRatePerMileCents: r.avgRatePerMileCents,
        avgTransitHours: r.avgTransitHours,
      })),
      columns: [
        { key: 'lane', label: 'Lane', format: 'text' },
        { key: 'loadCount', label: 'Loads', format: 'number' },
        { key: 'totalRevenueCents', label: 'Revenue', format: 'currency' },
        {
          key: 'avgRatePerMileCents',
          label: 'Avg Rate/Mile',
          format: 'currency',
        },
        {
          key: 'avgTransitHours',
          label: 'Avg Transit (hrs)',
          format: 'number',
        },
      ],
    };
  }

  @Get('reports/ar-aging')
  @ApiOperation({ summary: 'Get accounts receivable aging report' })
  async getArAging(@CurrentUser() user: any): Promise<ReportData> {
    const tenantDbId = await this.getTenantDbId(user);
    const result = await this.arAgingService.getArAging(tenantDbId);

    return {
      summary: {
        totalOutstandingCents: result.totalOutstandingCents,
        totalOverdueCents: result.totalOverdueCents,
        invoiceCount: result.buckets.reduce((s, b) => s + b.count, 0),
      },
      timeSeries: result.buckets.map((b) => ({
        period: b.label,
        value: b.totalCents,
      })),
      table: result.byCustomer.map((c) => ({ ...c })),
      columns: [
        { key: 'companyName', label: 'Customer', format: 'text' },
        { key: 'currentCents', label: 'Current', format: 'currency' },
        { key: 'aging1to30Cents', label: '1-30', format: 'currency' },
        { key: 'aging31to60Cents', label: '31-60', format: 'currency' },
        { key: 'aging61to90Cents', label: '61-90', format: 'currency' },
        { key: 'aging90PlusCents', label: '90+', format: 'currency' },
        { key: 'totalOutstandingCents', label: 'Total', format: 'currency' },
      ],
    };
  }

  // ─── Export ──────────────────────────────────────────────────────

  @Get('reports/:type/export')
  @ApiOperation({ summary: 'Export report as CSV or PDF' })
  @ApiParam({
    name: 'type',
    enum: ['revenue', 'profitability', 'drivers', 'fleet', 'customers', 'lanes', 'ar-aging'],
  })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'groupBy', required: false, enum: GroupByPeriod })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'pdf'] })
  async exportReport(
    @CurrentUser() user: any,
    @Param('type') type: string,
    @Query() query: ReportQueryDto,
    @Res() res: Response,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    const { dateFrom, dateTo } = this.resolveDateRange(query.dateFrom, query.dateTo);
    const groupBy = query.groupBy ?? GroupByPeriod.DAY;
    const limit = query.limit ?? 100;
    const format = query.format ?? 'csv';

    const REPORT_META: Record<
      string,
      {
        title: string;
        columns: { key: string; label: string; format?: string }[];
      }
    > = {
      revenue: {
        title: 'Revenue Summary',
        columns: [
          { key: 'period', label: 'Period' },
          { key: 'revenueCents', label: 'Revenue', format: 'currency' },
          { key: 'loadCount', label: 'Loads', format: 'number' },
          {
            key: 'avgRatePerMileCents',
            label: 'Avg Rate/Mile',
            format: 'currency',
          },
        ],
      },
      profitability: {
        title: 'Profitability Analysis',
        columns: [
          { key: 'loadNumber', label: 'Load #' },
          { key: 'customerName', label: 'Customer' },
          { key: 'revenueCents', label: 'Revenue', format: 'currency' },
          { key: 'totalCostCents', label: 'Costs', format: 'currency' },
          { key: 'marginPercent', label: 'Margin %', format: 'percent' },
        ],
      },
      drivers: {
        title: 'Driver Performance',
        columns: [
          { key: 'driverName', label: 'Driver' },
          { key: 'loadsCompleted', label: 'Loads', format: 'number' },
          { key: 'revenueCents', label: 'Revenue', format: 'currency' },
          { key: 'earningsCents', label: 'Earnings', format: 'currency' },
          { key: 'onTimePercent', label: 'On-Time %', format: 'percent' },
        ],
      },
      fleet: {
        title: 'Fleet Utilization',
        columns: [
          { key: 'unitNumber', label: 'Unit #' },
          { key: 'loadCount', label: 'Loads', format: 'number' },
          { key: 'totalMiles', label: 'Miles', format: 'number' },
          { key: 'revenueCents', label: 'Revenue', format: 'currency' },
          { key: 'revenuePerMileCents', label: 'Rev/Mile', format: 'currency' },
        ],
      },
      customers: {
        title: 'Customer Scorecard',
        columns: [
          { key: 'companyName', label: 'Customer' },
          { key: 'loadCount', label: 'Loads', format: 'number' },
          { key: 'revenueCents', label: 'Revenue', format: 'currency' },
          { key: 'avgPayDays', label: 'Avg Pay Days', format: 'number' },
          { key: 'outstandingCents', label: 'Outstanding', format: 'currency' },
        ],
      },
      lanes: {
        title: 'Lane Analysis',
        columns: [
          { key: 'lane', label: 'Lane' },
          { key: 'loadCount', label: 'Loads', format: 'number' },
          { key: 'totalRevenueCents', label: 'Revenue', format: 'currency' },
          {
            key: 'avgRatePerMileCents',
            label: 'Avg Rate/Mile',
            format: 'currency',
          },
        ],
      },
      'ar-aging': {
        title: 'AR Aging',
        columns: [
          { key: 'companyName', label: 'Customer' },
          { key: 'currentCents', label: 'Current', format: 'currency' },
          { key: 'aging1to30Cents', label: '1-30', format: 'currency' },
          { key: 'aging31to60Cents', label: '31-60', format: 'currency' },
          { key: 'aging61to90Cents', label: '61-90', format: 'currency' },
          { key: 'aging90PlusCents', label: '90+', format: 'currency' },
          { key: 'totalOutstandingCents', label: 'Total', format: 'currency' },
        ],
      },
    };

    const meta = REPORT_META[type];
    if (!meta) throw new BadRequestException(`Unknown report type: ${type}`);

    let data: Record<string, any>[];

    switch (type) {
      case 'revenue': {
        const result = await this.revenueReportService.getRevenueSummary(tenantDbId, dateFrom, dateTo, groupBy);
        data = result.periods;
        break;
      }
      case 'profitability':
        data = await this.profitabilityReportService.getProfitabilityByLoad(tenantDbId, dateFrom, dateTo, limit);
        break;
      case 'drivers':
        data = await this.driverPerformanceService.getDriverPerformance(tenantDbId, dateFrom, dateTo, limit);
        break;
      case 'fleet':
        data = await this.fleetUtilizationService.getFleetUtilization(tenantDbId, dateFrom, dateTo, limit);
        break;
      case 'customers':
        data = await this.customerScorecardService.getCustomerScorecard(tenantDbId, dateFrom, dateTo, limit);
        break;
      case 'lanes':
        data = await this.laneAnalysisService.getLaneAnalysis(tenantDbId, dateFrom, dateTo, limit);
        break;
      case 'ar-aging': {
        const result = await this.arAgingService.getArAging(tenantDbId);
        data = result.byCustomer;
        break;
      }
      default:
        throw new BadRequestException(`Unknown report type: ${type}`);
    }

    const timestamp = new Date().toISOString().split('T')[0];

    if (format === 'pdf') {
      const pdfBuffer = await this.reportExportService.exportPdf(tenantDbId, type, meta.title, data, meta.columns);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${timestamp}.pdf"`);
      return res.send(pdfBuffer);
    }

    const csv = await this.reportExportService.exportCsv(tenantDbId, type, meta.title, data);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${timestamp}.csv"`);
    return res.send(csv);
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private resolveDateRange(dateFrom?: string, dateTo?: string): { dateFrom: Date; dateTo: Date } {
    // Normalize to UTC midnight to avoid server-timezone dependency
    const to = dateTo
      ? new Date(`${dateTo}T23:59:59.999Z`)
      : new Date(new Date().toISOString().split('T')[0] + 'T23:59:59.999Z');
    const from = dateFrom
      ? new Date(`${dateFrom}T00:00:00.000Z`)
      : new Date(new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] + 'T00:00:00.000Z');
    return { dateFrom: from, dateTo: to };
  }
}
