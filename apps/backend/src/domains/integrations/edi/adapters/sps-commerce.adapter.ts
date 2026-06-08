import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { IEDIAdapter, EDIParsedTender, EDISendResult } from './edi-adapter.interface';

@Injectable()
export class SPSCommerceAdapter implements IEDIAdapter {
  private readonly logger = new Logger(SPSCommerceAdapter.name);

  async testConnection(config: Record<string, unknown>): Promise<boolean> {
    try {
      await this.makeRequest(config, 'GET', '/v1/connection/test');
      return true;
    } catch {
      return false;
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- satisfies IEDIAdapter contract
  async parseTender(rawPayload: Record<string, unknown>): Promise<EDIParsedTender> {
    const p = rawPayload as any;

    if (!p.shipmentId || !p.brokerName || !p.stops?.length) {
      throw new BadRequestException('Invalid 204 tender payload: missing shipmentId, brokerName, or stops');
    }

    return {
      transactionSetId: p.controlNumber ?? p.transactionSetIdentifier ?? '',
      brokerName: p.brokerName,
      brokerReference: p.brokerReference ?? p.shipmentId,
      shipmentId: p.shipmentId,
      equipmentType: p.equipmentType ?? 'dry_van',
      weightLbs: p.weightLbs ?? 0,
      commodityType: p.commodityType ?? 'General Freight',
      specialRequirements: p.specialRequirements,
      rateCents: p.totalCharge ?? 0,
      responseDeadline: p.responseDeadline,
      stops: (p.stops ?? []).map((s: any) => ({
        sequence: s.sequence,
        actionType: s.type === 'pickup' ? ('pickup' as const) : ('delivery' as const),
        address: s.address ?? '',
        city: s.city ?? '',
        state: s.state ?? '',
        zip: s.zip ?? '',
        appointmentDate: s.appointmentDate,
        earliestArrival: s.earliestArrival,
        latestArrival: s.latestArrival,
        contactName: s.contactName,
        contactPhone: s.contactPhone,
      })),
      metadata: p.metadata,
    };
  }

  async sendTenderResponse(
    config: Record<string, unknown>,
    tenderRef: string,
    response: 'accept' | 'decline' | 'counter',
    counterRate?: number,
  ): Promise<EDISendResult> {
    const responseCode = { accept: 'A', decline: 'D', counter: 'C' }[response];
    const payload: Record<string, unknown> = {
      transactionSetIdentifier: '990',
      shipmentReference: tenderRef,
      responseCode,
    };
    if (response === 'counter' && counterRate != null) {
      payload.counterRate = counterRate;
    }
    return this.sendMessage(config, payload);
  }

  async sendInvoice(config: Record<string, unknown>, invoiceData: Record<string, unknown>): Promise<EDISendResult> {
    return this.sendMessage(config, {
      transactionSetIdentifier: '210',
      ...invoiceData,
    });
  }

  async sendStatusUpdate(config: Record<string, unknown>, statusData: Record<string, unknown>): Promise<EDISendResult> {
    return this.sendMessage(config, {
      transactionSetIdentifier: '214',
      ...statusData,
    });
  }

  private async sendMessage(config: Record<string, unknown>, payload: Record<string, unknown>): Promise<EDISendResult> {
    try {
      const response = await this.makeRequest(config, 'POST', '/v1/transactions', payload);
      return {
        success: true,
        transactionSetId: (response as any)?.transactionSetId,
      };
    } catch (error: any) {
      this.logger.error(`SPS Commerce send failed: ${error.message}`);
      return { success: false, errorMessage: error.message ?? 'Unknown error' };
    }
  }

  private async makeRequest(
    config: Record<string, unknown>,
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ): Promise<unknown> {
    const baseUrl = (config.baseUrl as string) ?? 'https://api.spscommerce.com';
    const apiKey = config.apiKey as string;

    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new InternalServerErrorException('SPS Commerce API request failed — please try again');
    }

    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }
}
