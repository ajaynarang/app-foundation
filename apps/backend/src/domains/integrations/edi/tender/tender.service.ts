import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { EDITenderResponse, EDIMessageStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { CounterService } from '../../../../infrastructure/database/counter.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { PlansService } from '../../../platform/plans/plans.service';
import { AddOnsService } from '../../../platform/add-ons/add-ons.service';
import { EDIPartnerService } from '../services/edi-partner.service';
import { EDIMessageService } from '../services/edi-message.service';
import { TenderRulesService } from './tender-rules.service';
import { EDI_ADAPTER, IEDIAdapter } from '../adapters/edi-adapter.interface';

@Injectable()
export class TenderService {
  private readonly logger = new Logger(TenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly counterService: CounterService,
    private readonly messageService: EDIMessageService,
    private readonly partnerService: EDIPartnerService,
    private readonly rulesService: TenderRulesService,
    @Inject(EDI_ADAPTER) private readonly adapter: IEDIAdapter,
    private readonly events: DomainEventService,
    private readonly plansService: PlansService,
    private readonly addOnsService: AddOnsService,
  ) {}

  async processInboundTender(tenantId: number, senderIsaId: string, rawPayload: Record<string, unknown>) {
    // Gate EDI behind plan entitlement (webhook is @Public, bypasses PlanGuard)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { tenantId: true, plan: true },
    });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }
    const isEnabled = await this.plansService.isFeatureEnabled(tenant.plan, 'edi_integration');
    if (!isEnabled) {
      this.logger.warn(`Tenant ${tenantId} does not have edi_integration entitlement`);
      throw new ForbiddenException('EDI integration is not available on your current plan');
    }

    // B4: Track usage against add-on limits
    const usage = await this.addOnsService.incrementUsage(tenantId, 'edi_integration');
    if (!usage.allowed) {
      this.logger.warn(`Tenant ${tenantId} EDI usage limit reached: ${usage.currentUsage}/${usage.usageLimit}`);
      throw new ForbiddenException('EDI message limit reached. Enable overage or upgrade your plan.');
    }

    const partner = await this.partnerService.findByIsaId(tenantId, senderIsaId);
    if (!partner) {
      this.logger.warn(`Unknown EDI sender ISA: ${senderIsaId} for tenant ${tenantId}`);
      throw new NotFoundException(`Trading partner with ISA ${senderIsaId} not found`);
    }

    const parsed = await this.adapter.parseTender(rawPayload);

    // D2: Idempotency check — reject duplicate tenders by transactionSetId
    if (parsed.transactionSetId) {
      const existing = await this.prisma.eDIMessage.findFirst({
        where: {
          tenantId,
          transactionSetId: parsed.transactionSetId,
          messageType: 'T204',
        },
      });
      if (existing) {
        this.logger.warn(`Duplicate tender transactionSetId=${parsed.transactionSetId} for tenant ${tenantId}`);
        throw new ConflictException(`Duplicate tender: transactionSetId ${parsed.transactionSetId} already processed`);
      }
    }

    // B2: Use distance from payload if available, otherwise estimate from stops
    const totalMiles =
      (rawPayload as any).totalMiles ?? (rawPayload as any).estimatedMiles ?? (parsed.stops.length >= 2 ? 300 : 0); // fallback placeholder

    const matchingRule = await this.rulesService.evaluateRules(tenantId, {
      rateCents: parsed.rateCents,
      totalMiles,
      equipmentType: parsed.equipmentType,
      tradingPartnerId: partner.id,
      originState: parsed.stops[0]?.state,
      destinationState: parsed.stops[parsed.stops.length - 1]?.state,
    });

    const autoAccept = !!matchingRule;
    const loadStatus = autoAccept ? 'PENDING' : 'TENDER';

    // Generate load number using atomic counter (same pattern as loads.service.ts)
    const dateStr = new Date().toISOString().slice(0, 10);
    const seq = await this.counterService.nextValue(tenantId, `load:${dateStr}`);
    const loadNumber = `LD-${dateStr.replace(/-/g, '')}-${String(seq).padStart(3, '0')}`;

    // Resolve or create customer from broker name (EDI tenders always have a broker)
    let ediCustomer = await this.prisma.customer.findFirst({
      where: { tenantId, companyName: parsed.brokerName },
      select: { id: true },
    });
    if (!ediCustomer) {
      ediCustomer = await this.prisma.customer.create({
        data: {
          customerId: `CUST-EDI-${Date.now()}`,
          companyName: parsed.brokerName,
          tenantId,
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      this.logger.log(`Auto-created customer "${parsed.brokerName}" from EDI tender`);
    }

    // D1: Wrap all writes in a transaction for atomicity
    const { load, message } = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.eDIMessage.create({
        data: {
          tenantId,
          tradingPartnerId: partner.id,
          direction: 'INBOUND',
          messageType: 'T204',
          transactionSetId: parsed.transactionSetId,
          referenceNumber: parsed.brokerReference,
          status: EDIMessageStatus.RECEIVED,
          rawPayload: JSON.stringify(rawPayload),
          parsedData: parsed as unknown as Prisma.InputJsonValue,
          expiresAt: parsed.responseDeadline ? new Date(parsed.responseDeadline) : undefined,
        },
      });

      await tx.eDITradingPartner.update({
        where: { id: partner.id },
        data: { tendersReceived: { increment: 1 }, lastMessageAt: new Date() },
      });

      const newLoad = await tx.load.create({
        data: {
          tenant: { connect: { id: tenantId } },
          customer: { connect: { id: ediCustomer.id } },
          loadNumber: parsed.brokerReference,
          status: loadStatus,
          customerName: parsed.brokerName,
          weightLbs: parsed.weightLbs,
          commodityType: parsed.commodityType,
          specialRequirements: parsed.specialRequirements,
          requiredEquipmentType: parsed.equipmentType
            ? (parsed.equipmentType.toUpperCase().replace(/[\s-]+/g, '_') as any)
            : null,
          rateCents: parsed.rateCents,
          referenceNumber: parsed.shipmentId,
          intakeSource: 'edi',
          intakeMetadata: {
            ediMessageId: msg.id,
            tradingPartnerId: partner.id,
            brokerReference: parsed.brokerReference,
            transactionSetId: parsed.transactionSetId,
            autoAccepted: autoAccept,
            autoAcceptRuleName: matchingRule?.name,
          },
          ediTenderMessage: { connect: { id: msg.id } },
          tenderExpiresAt: parsed.responseDeadline ? new Date(parsed.responseDeadline) : undefined,
          tenderResponse: autoAccept ? EDITenderResponse.ACCEPTED : undefined,
          tenderRespondedAt: autoAccept ? new Date() : undefined,
          originCity: parsed.stops[0]?.city,
          originState: parsed.stops[0]?.state,
          destinationCity: parsed.stops[parsed.stops.length - 1]?.city,
          destinationState: parsed.stops[parsed.stops.length - 1]?.state,
          stops: {
            create: parsed.stops.map((s, idx) => ({
              stopId: idx + 1,
              sequenceOrder: s.sequence,
              actionType: s.actionType,
              address: s.address,
              city: s.city,
              state: s.state,
              zipCode: s.zip,
              appointmentDate: s.appointmentDate ? new Date(s.appointmentDate) : undefined,
              estimatedDockHours: 2,
            })),
          },
        },
        include: { stops: true },
      });

      // Update message with load reference
      await tx.eDIMessage.update({
        where: { id: msg.id },
        data: {
          loadId: newLoad.id,
          status: autoAccept ? EDIMessageStatus.PROCESSING : EDIMessageStatus.RECEIVED,
        },
      });

      return { load: newLoad, message: msg };
    });

    // Post-transaction: auto-accept side effects (adapter call + events)
    if (autoAccept && matchingRule) {
      try {
        await this.adapter.sendTenderResponse(partner.vanConfig as any, parsed.brokerReference, 'accept');
        await this.messageService.markResponded(message.id);
        await this.rulesService.incrementMatchCount(matchingRule.id);
        await this.partnerService.incrementTenderStats(partner.id, 'tendersAccepted');
      } catch (error: any) {
        this.logger.error(`Auto-accept adapter call failed for load ${load.id}: ${error.message}`);
        // Load is created but adapter failed — mark message for retry
        await this.messageService.updateStatus(message.id, 'FAILED' as any, error.message);
      }

      await this.events.emit(SALLY_EVENTS.EDI_TENDER_ACCEPTED, tenantId, {
        entityId: String(load.id),
        entityType: 'edi-tender',
        loadId: load.id,
        partnerId: partner.id,
        partnerName: partner.name,
        autoAccepted: true,
        ruleName: matchingRule.name,
      });
    } else {
      await this.events.emit(SALLY_EVENTS.EDI_TENDER_RECEIVED, tenantId, {
        entityId: String(load.id),
        entityType: 'edi-tender',
        loadId: load.id,
        partnerId: partner.id,
        partnerName: partner.name,
        brokerReference: parsed.brokerReference,
        rateCents: parsed.rateCents,
        totalMiles,
        originCity: parsed.stops[0]?.city,
        originState: parsed.stops[0]?.state,
        destinationCity: parsed.stops[parsed.stops.length - 1]?.city,
        destinationState: parsed.stops[parsed.stops.length - 1]?.state,
        expiresAt: parsed.responseDeadline,
      });
    }

    return { load, message, autoAccepted: autoAccept };
  }

  async respondToTender(
    tenantId: number,
    loadId: number,
    response: 'accept' | 'decline' | 'counter',
    counterRateCents?: number,
  ) {
    const load = await this.prisma.load.findFirst({
      where: { id: loadId, tenantId, status: 'TENDER' },
      include: {
        ediTenderMessage: { include: { tradingPartner: true } },
      },
    });

    if (!load) throw new NotFoundException(`Tender load ${loadId} not found or not in tender status`);
    if (!load.ediTenderMessage?.tradingPartner) throw new BadRequestException('Load has no associated EDI tender');

    const partner = load.ediTenderMessage.tradingPartner;
    const brokerRef = (load.intakeMetadata as any)?.brokerReference;

    // Send response to VAN provider first
    const result = await this.adapter.sendTenderResponse(
      partner.vanConfig as any,
      brokerRef,
      response,
      counterRateCents ? counterRateCents / 100 : undefined,
    );

    if (!result.success) {
      throw new BadRequestException(`Failed to send tender response: ${result.errorMessage}`);
    }

    const tenderResponseEnum: Record<string, EDITenderResponse> = {
      accept: EDITenderResponse.ACCEPTED,
      decline: EDITenderResponse.DECLINED,
      counter: EDITenderResponse.COUNTERED,
    };
    const newStatus = response === 'accept' ? 'PENDING' : response === 'decline' ? 'CANCELLED' : 'TENDER';

    // D3: Wrap DB updates in transaction after successful adapter call
    const updatedLoad = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.load.update({
        where: { id: loadId },
        data: {
          status: newStatus,
          tenderResponse: tenderResponseEnum[response],
          tenderRespondedAt: new Date(),
          ...(response === 'decline' ? { cancelledAt: new Date() } : {}),
        },
      });

      if (load.ediTenderId) {
        await tx.eDIMessage.update({
          where: { id: load.ediTenderId },
          data: { respondedAt: new Date() },
        });
      }

      // B5: Track all response types including counter
      const statsField = response === 'accept' ? 'tendersAccepted' : response === 'decline' ? 'tendersDeclined' : null;
      if (statsField) {
        await tx.eDITradingPartner.update({
          where: { id: partner.id },
          data: { [statsField]: { increment: 1 }, lastMessageAt: new Date() },
        });
      }

      return updated;
    });

    const eventMap: Record<string, string> = {
      accept: SALLY_EVENTS.EDI_TENDER_ACCEPTED,
      decline: SALLY_EVENTS.EDI_TENDER_DECLINED,
      counter: SALLY_EVENTS.EDI_TENDER_COUNTERED,
    };
    await this.events.emit(eventMap[response], tenantId, {
      entityId: String(loadId),
      entityType: 'edi-tender',
      loadId,
      partnerId: partner.id,
      partnerName: partner.name,
      response,
      counterRateCents,
    });

    return updatedLoad;
  }
}
