/** Extracted data from a parsed rate confirmation PDF */
export interface RateconData {
  loadNumber: string;
  poNumber?: string;
  referenceNumbers?: string[];

  brokerName: string;
  brokerMc?: string;
  brokerContactName?: string;
  brokerContactEmail?: string;
  brokerContactPhone?: string;

  equipmentType?: string;
  mode?: string;
  commodity?: string;
  weightLbs?: number;
  pieces?: number;

  rateTotalUsd: number;
  rateDetails?: Array<{
    type: string;
    amountUsd: number;
  }>;

  stops: Array<{
    sequence: number;
    actionType: 'pickup' | 'delivery';
    facilityName: string;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    appointmentDate?: string;
    appointmentTime?: string;
    contactName?: string;
    contactPhone?: string;
    facilityHours?: string;
    pickupNumber?: string;
    reference?: string;
  }>;

  specialInstructions?: string;
}

/** Response from the parse-ratecon endpoint (always 202 Accepted) */
export interface ParseRateconResponse {
  jobId: number;
  status: 'queued';
  fileName: string;
}

/**
 * Ghost-card lifecycle states. Client-only UI animation states
 */
export const GHOST_IMPORT_STATUS = {
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;
export type GhostImportStatus = (typeof GHOST_IMPORT_STATUS)[keyof typeof GHOST_IMPORT_STATUS];

/** Ghost card state for in-progress rate-con imports in the Kanban board */
export interface GhostImport {
  jobId: number;
  fileName: string;
  startedAt: Date;
  status: GhostImportStatus;
  loadNumber?: string;
  errorMessage?: string;
  retryCount: number;
}

/** Job status from the /jobs endpoint */
export interface JobStatus {
  id: number;
  category: string;
  type: string;
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputData: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resultData?: Record<string, any>;
  errorMessage?: string;
  progress?: number;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  dismissedAt?: string;
}
