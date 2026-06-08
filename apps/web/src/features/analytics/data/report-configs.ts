import type { ReportConfig, ReportCategory } from '../types';

/**
 * Insights catalog. Every report lives in exactly one of three audience-
 * question sections — Money / Operations / Compliance — set by `category`.
 * The grid in `ReportGrid` groups by this field and renders a section
 * heading for each. See `.docs/plans/18-reporting/2026-05-20-workspace-vs-
 * insights-master-plan.md` for the full IA principle.
 *
 * `ar-aging` was renamed to `ar-health` (2026-05-20, Phase A). The legacy
 * `/insights/ar-aging` URL still redirects via a thin alias page so any
 * external bookmark survives — see `app/dispatcher/insights/ar-aging/`.
 */
export const REPORT_CONFIGS: ReportConfig[] = [
  // ── Money ──────────────────────────────────────────────────────────
  {
    type: 'revenue',
    title: 'Revenue Summary',
    description: 'Track revenue trends by period, customer, and lane',
    icon: 'DollarSign',
    color: 'text-muted-foreground',
    category: 'Money',
  },
  {
    type: 'profitability',
    title: 'Profitability Analysis',
    description: 'Analyze margins across loads, lanes, and drivers',
    icon: 'TrendingUp',
    color: 'text-muted-foreground',
    category: 'Money',
  },
  {
    type: 'ar-health',
    title: 'AR Health',
    description: 'Aging, factoring activity, and days sales outstanding',
    icon: 'Clock',
    color: 'text-muted-foreground',
    category: 'Money',
  },
  {
    type: 'customers',
    title: 'Customer Scorecard',
    description: 'Evaluate customer profitability and payment behavior',
    icon: 'Building2',
    color: 'text-muted-foreground',
    category: 'Money',
  },

  // ── Operations ─────────────────────────────────────────────────────
  {
    type: 'drivers',
    title: 'Driver Performance',
    description: 'Monitor driver productivity, earnings, and HOS compliance',
    icon: 'Users',
    color: 'text-muted-foreground',
    category: 'Operations',
  },
  {
    type: 'fleet',
    title: 'Fleet Utilization',
    description: 'Track vehicle usage, deadhead, and maintenance schedules',
    icon: 'Truck',
    color: 'text-muted-foreground',
    category: 'Operations',
  },
  {
    type: 'lanes',
    title: 'Lane Analysis',
    description: 'Discover top lanes, rate trends, and backhaul opportunities',
    icon: 'MapPin',
    color: 'text-muted-foreground',
    category: 'Operations',
  },

  // ── Compliance ─────────────────────────────────────────────────────
  {
    type: 'compliance-trend',
    title: 'Compliance Trend',
    description: 'Shield score history and past audit results',
    icon: 'ShieldCheck',
    color: 'text-muted-foreground',
    category: 'Compliance',
  },
];

/**
 * Section order on the Insights hub. Renderable even when a section has
 * zero configs — the grid surfaces "More coming soon" so users can see
 * the IA is intentionally incomplete-by-design.
 */
export const REPORT_CATEGORIES: readonly ReportCategory[] = ['Money', 'Operations', 'Compliance'] as const;

export function getReportConfig(type: string): ReportConfig | undefined {
  return REPORT_CONFIGS.find((c) => c.type === type);
}

export const VALID_REPORT_TYPES = REPORT_CONFIGS.map((c) => c.type);

export function getReportsForCategory(category: ReportCategory): ReportConfig[] {
  return REPORT_CONFIGS.filter((c) => c.category === category);
}
