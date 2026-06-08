export interface EDITender {
  id: number;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  transactionSetId: string | null;
  referenceNumber: string | null;
  status: string;
  tradingPartner: { name: string };
  load: {
    id: number;
    loadNumber: string;
    referenceNumber: string | null;
    status: string;
    rateCents: number | null;
    customerName: string;
    originCity: string | null;
    originState: string | null;
    destinationCity: string | null;
    destinationState: string | null;
    estimatedMiles: number | null;
    requiredEquipmentType: string | null;
  } | null;
  expiresAt: string | null;
  parsedData: {
    brokerName?: string;
    rateCents?: number;
    equipmentType?: string;
    stops?: Array<{ city: string; state: string; actionType: string }>;
  } | null;
  createdAt: string;
}

export interface EDITradingPartner {
  id: number;
  name: string;
  isaId: string;
  gsId: string;
  vanProvider: string;
  supportedMessages: string[];
  statusUpdateLevel: string;
  isActive: boolean;
  tendersReceived: number;
  tendersAccepted: number;
  tendersDeclined: number;
  lastMessageAt: string | null;
  _count?: { messages: number; autoAcceptRules: number };
}

export interface EDIAutoAcceptRule {
  id: number;
  name: string;
  conditions: Record<string, unknown>;
  isActive: boolean;
  priority: number;
  matchCount: number;
  lastMatchAt: string | null;
  createdBy: string;
  suggestedFromPattern: Record<string, unknown> | null;
  approvedAt: string | null;
  tradingPartner?: { name: string } | null;
}

export interface TenderResponseDto {
  response: 'accept' | 'decline' | 'counter';
  counterRateCents?: number;
}
