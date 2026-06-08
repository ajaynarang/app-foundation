export interface KpiDashboard {
  todayRevenueCents: number;
  mtdRevenueCents: number;
  activeLoads: number;
  onTimePercent: number;
  fleetUtilizationPercent: number;
  arOutstandingCents: number;
  shieldScore: number | null;
  mtdMarginPercent: number;
}

export interface ReportParams {
  dateFrom?: string;
  dateTo?: string;
  groupBy?: 'day' | 'week' | 'month';
  limit?: number;
}

export interface TimeSeriesPoint {
  period: string;
  value: number;
  label?: string;
}

export interface ReportData {
  summary: Record<string, number>;
  timeSeries?: TimeSeriesPoint[];
  table?: Record<string, unknown>[];
  columns?: ReportColumn[];
}

export interface ReportColumn {
  key: string;
  label: string;
  format?: 'currency' | 'percent' | 'number' | 'text' | 'date';
}

export interface AiBriefing {
  type: 'daily' | 'weekly';
  generatedAt: string;
  sections: BriefingSection[];
}

export interface BriefingSection {
  title: string;
  content: string;
  highlights?: string[];
  trend?: 'up' | 'down' | 'flat';
}

export type ReportType =
  | 'revenue'
  | 'profitability'
  | 'drivers'
  | 'fleet'
  | 'customers'
  | 'lanes'
  | 'ar-health'
  | 'compliance-trend';

/**
 * The three audience-question sections under Insights. New reports must
 * pick exactly one. Compliance section may render the "More coming soon"
 * placeholder until a real report lands (see Phase B of the workspace ↔
 * insights master plan).
 */
export type ReportCategory = 'Money' | 'Operations' | 'Compliance';

export interface ReportConfig {
  type: ReportType;
  title: string;
  description: string;
  icon: string;
  color: string;
  category: ReportCategory;
}
