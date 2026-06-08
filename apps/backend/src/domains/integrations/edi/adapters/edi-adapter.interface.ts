/** DI token for the EDI adapter — inject via @Inject(EDI_ADAPTER) */
export const EDI_ADAPTER = Symbol('EDI_ADAPTER');

export interface EDIParsedTender {
  transactionSetId: string;
  brokerName: string;
  brokerReference: string;
  shipmentId: string;
  equipmentType: string;
  weightLbs: number;
  commodityType: string;
  specialRequirements?: string;
  rateCents: number;
  responseDeadline?: string;
  stops: Array<{
    sequence: number;
    actionType: 'pickup' | 'delivery';
    address: string;
    city: string;
    state: string;
    zip: string;
    appointmentDate?: string;
    earliestArrival?: string;
    latestArrival?: string;
    contactName?: string;
    contactPhone?: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface EDISendResult {
  success: boolean;
  transactionSetId?: string;
  errorMessage?: string;
}

export interface IEDIAdapter {
  testConnection(config: Record<string, unknown>): Promise<boolean>;
  parseTender(rawPayload: Record<string, unknown>): Promise<EDIParsedTender>;
  sendTenderResponse(
    config: Record<string, unknown>,
    tenderRef: string,
    response: 'accept' | 'decline' | 'counter',
    counterRate?: number,
  ): Promise<EDISendResult>;
  sendInvoice(config: Record<string, unknown>, invoiceData: Record<string, unknown>): Promise<EDISendResult>;
  sendStatusUpdate(config: Record<string, unknown>, statusData: Record<string, unknown>): Promise<EDISendResult>;
}
