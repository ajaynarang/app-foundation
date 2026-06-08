export interface EmailIngestThread {
  id: string;
  senderEmail: string;
  senderName: string | null;
  subject: string;
  status: 'PENDING' | 'CONFIRMED' | 'DISCARDED' | 'ARCHIVED';
  confirmedLoadId: string | null;
  confirmedAt: string | null;
  messages: EmailIngestMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface EmailIngestMessage {
  id: string;
  messageId: string;
  fromEmail: string;
  fromName: string | null;
  subject: string;
  receivedAt: string;
  bodyPreview: string | null;
  attachments: EmailIngestAttachment[];
}

export interface EmailIngestAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  contentHash: string;
  filterResult: EmailIngestFilterResult;
  filterReason: string | null;
  parseStatus: EmailIngestParseStatus;
  parsedData: ParsedRateconData | null;
  parseConfidence: number | null;
  parsedLoadNumber: string | null;
  isLatestVersion: boolean;
}

export type EmailIngestFilterResult =
  | 'PENDING'
  | 'PASSED'
  | 'SENDER_UNKNOWN'
  | 'WRONG_TYPE'
  | 'TOO_SMALL'
  | 'TOO_LARGE'
  | 'DUPLICATE'
  | 'NOT_RATECON'
  | 'BLOCKED_NAME';

export type EmailIngestParseStatus = 'PENDING' | 'PARSING' | 'PARSED' | 'FAILED' | 'SKIPPED';

export interface ParsedRateconData {
  load_number: string;
  broker_name: string;
  rate_total_usd: number;
  broker_mc?: string;
  equipment_type?: string;
  commodity?: string;
  weight_lbs?: number;
  pieces?: number;
  miles?: number;
  special_instructions?: string;
  stops: ParsedStop[];
}

export interface ParsedStop {
  sequence: number;
  action_type: 'pickup' | 'delivery';
  facility_name: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  appointment_date?: string;
  appointment_time?: string;
}

export interface EmailIngestSettings {
  inboundAddress: string;
  isEnabled: boolean;
  approvedDomains: string[];
  autoApproveCustomerDomains: boolean;
  unknownSenderPolicy: 'HOLD' | 'PARSE_ANYWAY' | 'REJECT';
}

// Fix #11: Backend returns { data, total, page, limit, totalPages }
export interface EmailThreadsResponse {
  data: EmailIngestThread[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
