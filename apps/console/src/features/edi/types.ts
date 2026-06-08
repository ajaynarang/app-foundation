// EDI types for Console settings pages

export type EdiPartnerStatus = 'ACTIVE' | 'INACTIVE';
export type EdiUpdateLevel = 'FULL' | 'CHANGES_ONLY' | 'NONE';

export interface EdiPartner {
  id: string;
  tenantId: string;
  name: string;
  isaId: string;
  gsId: string;
  status: EdiPartnerStatus;
  updateLevel: EdiUpdateLevel;
  supportedTransactions: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  totalMessages: number;
  tendersReceived: number;
  tendersAccepted: number;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type EdiRuleStatus = 'ACTIVE' | 'INACTIVE' | 'SUGGESTED';

export interface EdiAutoAcceptRule {
  id: string;
  tenantId: string;
  name: string;
  partnerId: string | null;
  partnerName: string | null;
  conditions: EdiRuleConditions;
  conditionsSummary: string;
  status: EdiRuleStatus;
  matchCount: number;
  isSallySuggested: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EdiRuleConditions {
  minRatePerMile?: number;
  maxDistance?: number;
  equipmentTypes?: string[];
  lanes?: { origin: string; destination: string }[];
  partners?: string[];
}

export type EdiMessageDirection = 'INBOUND' | 'OUTBOUND';
export type EdiMessageType = '204' | '210' | '214' | '990' | '997';
export type EdiMessageStatus = 'SENT' | 'RECEIVED' | 'PROCESSING' | 'ACCEPTED' | 'REJECTED' | 'FAILED' | 'ACKNOWLEDGED';

export interface EdiMessage {
  id: string;
  tenantId: string;
  direction: EdiMessageDirection;
  transactionType: EdiMessageType;
  partnerId: string;
  partnerName: string;
  referenceNumber: string | null;
  status: EdiMessageStatus;
  errorMessage: string | null;
  rawData: string | null;
  parsedData: Record<string, unknown> | null;
  createdAt: string;
}

export interface EdiMessagesResponse {
  data: EdiMessage[];
  total: number;
  limit: number;
  offset: number;
}
