export type { CloseOutLoad, CloseOutSummary, BillingReadinessItem, BillingReadinessResult } from '@sally/shared-types';

export interface CloseOutListResponse {
  loads: import('@sally/shared-types').CloseOutLoad[];
  total: number;
}

export interface CloseOutListParams {
  billingStatus?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  offset?: number;
}
