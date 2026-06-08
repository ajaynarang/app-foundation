// IFTA Fuel Tax Reporting — Frontend Types

export type IftaQuarterStatus = 'OPEN' | 'CALCULATING' | 'DRAFT' | 'REVIEWED' | 'FILED' | 'CONFIRMED' | 'AMENDED';

export interface IftaQuarter {
  id: string;
  tenantId: number;
  year: number;
  quarter: number;
  status: IftaQuarterStatus;
  periodStart: string;
  periodEnd: string;
  totalMiles: number | null;
  totalGallons: number | null;
  netTaxDueCents: number | null;
  totalTaxOwedCents: number | null;
  totalTaxPaidCents: number | null;
  anomalyCount: number;
  anomalies: IftaAnomaly[] | null;
  filedAt: string | null;
  filing: IftaFiling | null;
  stateMileage?: IftaStateMileage[];
  fuelPurchases?: IftaFuelPurchase[];
  createdAt: string;
  updatedAt: string;
}

export interface IftaStateMileage {
  id: string;
  jurisdiction: string;
  totalMiles: number;
  taxableGallons: number | null;
  taxRatePerGallon: number | null;
  surchargeRate: number | null;
  taxOwedCents: number | null;
  surchargeOwedCents: number | null;
  source: string;
}

export interface IftaFuelPurchase {
  id: string;
  purchaseDate: string;
  jurisdiction: string;
  gallons: number;
  pricePerGallon: number | null;
  totalCostCents: number | null;
  stationName: string | null;
  source: string;
  vehicle?: { unitNumber: string };
  notes: string | null;
}

export interface IftaFiling {
  id: string;
  filingMethod: string | null;
  confirmationNumber: string | null;
  filedAt: string | null;
  dueDate: string;
  amountDueCents: number | null;
  amountPaidCents: number | null;
}

export interface IftaAnomaly {
  type: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  description: string;
  jurisdiction?: string;
  recommendation: string;
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
  filingDeadline: string;
  daysUntilDeadline: number;
}

export interface IftaCalculationResult {
  quarterId: string;
  year: number;
  quarter: number;
  totalMiles: number;
  totalGallons: number;
  fleetAvgMpg: number;
  netTaxDueCents: number;
  totalTaxOwedCents: number;
  totalTaxPaidCents: number;
  stateBreakdown: IftaStateCalculation[];
}

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
