// apps/backend/src/domains/operations/ifta/ifta.types.ts

/**
 * IFTA Fuel Tax Reporting — Domain Types
 *
 * IFTA (International Fuel Tax Agreement) requires carriers to report
 * miles driven and fuel purchased per jurisdiction each quarter.
 * Tax is calculated as: (miles / fleet_avg_mpg) * state_tax_rate
 * Credit is given for fuel tax already paid at the pump.
 * Net = tax_owed - tax_paid → positive means carrier owes, negative means refund.
 */

// ─── Quarter Helpers ───────────────────────────────────────────────

export interface QuarterPeriod {
  year: number;
  quarter: number;
  periodStart: Date;
  periodEnd: Date;
}

export function getQuarterPeriod(year: number, quarter: number): QuarterPeriod {
  const startMonth = (quarter - 1) * 3;
  const periodStart = new Date(year, startMonth, 1);
  const periodEnd = new Date(year, startMonth + 3, 0); // Last day of quarter
  return { year, quarter, periodStart, periodEnd };
}

export function getQuarterFromDate(date: Date): {
  year: number;
  quarter: number;
} {
  const year = date.getFullYear();
  const quarter = Math.ceil((date.getMonth() + 1) / 3);
  return { year, quarter };
}

export function getIftaFilingDeadline(year: number, quarter: number): Date {
  // IFTA returns due last day of month following quarter end
  // Q1→Apr30, Q2→Jul31, Q3→Oct31, Q4→Jan31(next year)
  const deadlineMonth = quarter * 3;
  const deadlineYear = quarter === 4 ? year + 1 : year;
  const adjustedMonth = quarter === 4 ? 0 : deadlineMonth;
  return new Date(deadlineYear, adjustedMonth + 1, 0);
}

export function formatQuarterLabel(year: number, quarter: number): string {
  return `Q${quarter} ${year}`;
}

// ─── Calculation Types ─────────────────────────────────────────────

export interface IftaStateCalculation {
  jurisdiction: string;
  jurisdictionName: string;
  totalMiles: number;
  taxableGallons: number;
  fuelPurchasedGallons: number;
  taxRate: number;
  surchargeRate: number;
  taxOwedCents: number;
  surchargeOwedCents: number;
  taxPaidCents: number;
  netTaxCents: number;
}

export interface IftaQuarterSummary {
  year: number;
  quarter: number;
  status: string;
  totalMiles: number;
  totalGallons: number;
  fleetAvgMpg: number;
  totalTaxOwedCents: number;
  totalTaxPaidCents: number;
  netTaxDueCents: number;
  stateCount: number;
  anomalyCount: number;
  filingDeadline: Date;
  daysUntilDeadline: number;
}

// ─── Anomaly Detection ─────────────────────────────────────────────

export enum IftaAnomalyType {
  NO_FUEL_IN_HIGH_MILEAGE_STATE = 'NO_FUEL_IN_HIGH_MILEAGE_STATE',
  UNUSUALLY_HIGH_MPG = 'UNUSUALLY_HIGH_MPG',
  UNUSUALLY_LOW_MPG = 'UNUSUALLY_LOW_MPG',
  MISSING_MILEAGE_DATA = 'MISSING_MILEAGE_DATA',
  FUEL_WITHOUT_MILEAGE = 'FUEL_WITHOUT_MILEAGE',
  MILEAGE_SPIKE = 'MILEAGE_SPIKE',
  TAX_RATE_MISSING = 'TAX_RATE_MISSING',
  QUARTER_DEADLINE_APPROACHING = 'QUARTER_DEADLINE_APPROACHING',
  QUARTER_DEADLINE_OVERDUE = 'QUARTER_DEADLINE_OVERDUE',
}

export interface IftaAnomaly {
  type: IftaAnomalyType;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  jurisdiction?: string;
  vehicleId?: number;
  recommendation: string;
}

// ─── Constants ─────────────────────────────────────────────────────

export const DEFAULT_FLEET_AVG_MPG = 6.5;
export const NO_FUEL_MILEAGE_THRESHOLD = 500;
export const MPG_RANGE = { min: 4.0, max: 9.0 };
export const DEADLINE_WARNING_DAYS = 30;
export const DEADLINE_CRITICAL_DAYS = 7;

export const IFTA_US_JURISDICTIONS = [
  'AL',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

export type UsStateCode = (typeof IFTA_US_JURISDICTIONS)[number];
