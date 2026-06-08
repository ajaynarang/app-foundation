export type {
  SettlementStatus,
  PayStructureType,
  DeductionType,
  DriverPayStructure,
  SettlementLineItem,
  SettlementDeduction,
  Settlement,
  SettlementSummary,
  SettlementListParams,
} from '@sally/shared-types';

export interface BatchPreviewDriver {
  driverId: string;
  name: string;
  payType: import('@sally/shared-types').PayStructureType | null;
  rate: string | null;
  loadCount: number;
  estimatedPayCents: number;
  eligible: boolean;
  warning: string | null;
}

export interface BatchPreviewResponse {
  drivers: BatchPreviewDriver[];
}

export interface BatchCalculateResponse {
  settlements: import('@sally/shared-types').Settlement[];
  errors: Array<{ driverId: string; error: string }>;
  total: number;
  successCount: number;
}

export interface BatchActionResponse {
  approved?: number;
  paid?: number;
  voided?: number;
  skipped: number;
}
