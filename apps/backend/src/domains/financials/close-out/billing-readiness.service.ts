import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../infrastructure/events/sally-events.constants';
import { getComplianceDocumentTypes, DocumentStatusSchema, LoadStopStatusSchema } from '@sally/shared-types';

const DOCUMENT_STATUS = DocumentStatusSchema.enum;
const LOAD_STOP_STATUS = LoadStopStatusSchema.enum;

export interface BillingReadinessItem {
  category: 'document' | 'charge';
  type: string;
  label: string;
  enforcement: 'required' | 'recommended' | 'when_applicable';
  status: 'satisfied' | 'missing' | 'overdue' | 'not_applicable';
  reason: string;
  relatedStopId?: number;
  relatedStopName?: string;
  dueBy?: string;
  satisfiedBy?: {
    documentId: number;
    fileName: string;
    uploadedAt: string;
  };
  amountCents?: number;
}

export interface BillingReadinessResult {
  score: number;
  totalRequired: number;
  totalSatisfied: number;
  readyToApprove: boolean;
  hasBlockers: boolean;
  items: BillingReadinessItem[];
  overrideAllowed: boolean;
  overrideExists?: {
    overriddenBy: string;
    reason: string;
    createdAt: string;
  };
}

@Injectable()
export class BillingReadinessService {
  private readonly logger = new Logger(BillingReadinessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: DomainEventService,
  ) {}

  async evaluate(loadNumber: string, tenantId: number): Promise<BillingReadinessResult> {
    const load = await this.prisma.load.findFirst({
      where: { loadNumber, tenantId },
      include: {
        stops: {
          include: { stop: { select: { name: true } } },
          orderBy: { sequenceOrder: 'asc' as const },
        },
        charges: true,
      },
    });

    if (!load) {
      throw new NotFoundException(`Load ${loadNumber} not found`);
    }

    const settingsRow = await this.prisma.fleetOperationsSettings.findUnique({
      where: { tenantId },
    });

    const documents = await this.prisma.document.findMany({
      where: {
        entityType: 'load',
        entityId: load.id,
        tenantId,
        status: DOCUMENT_STATUS.CONFIRMED,
      },
    });

    const items: BillingReadinessItem[] = [];

    // --- Document requirements (data-driven from registry) ---

    const complianceTypes = getComplianceDocumentTypes('load');

    for (const [code, config] of complianceTypes) {
      // Resolve enforcement: tenant settings override → registry default
      const enforcement: string = config.enforcementSettingsKey
        ? ((settingsRow as any)?.[config.enforcementSettingsKey] ?? config.defaultEnforcement)
        : config.defaultEnforcement;

      if (enforcement === 'not_required') continue;

      // when_applicable: only include if the load has the triggering charge
      if (enforcement === 'when_applicable' && config.applicableChargeType) {
        const hasCharge = load.charges?.some((c: any) => c.chargeType === config.applicableChargeType);
        if (!hasCharge) continue;
      }

      if (config.isPerStop) {
        // Per-stop document (BOL at pickups, POD at deliveries)
        for (const stop of load.stops) {
          if (
            (stop.actionType === config.stopActionType || stop.actionType === 'both') &&
            stop.status === LOAD_STOP_STATUS.COMPLETED
          ) {
            const doc = documents.find((d) => d.documentType === code && d.relatedStopId === stop.id);
            const stopName = stop.stop?.name ?? `Stop ${stop.sequenceOrder}`;

            let status: BillingReadinessItem['status'] = doc ? 'satisfied' : 'missing';
            let dueBy: string | undefined;

            // POD grace period logic (POD-specific)
            if (!doc && code === 'pod' && stop.completedAt) {
              const gracePeriodHours = (settingsRow as any)?.podGracePeriodHours ?? 48;
              const gracePeriodMs = gracePeriodHours * 60 * 60 * 1000;
              const deadline = new Date(stop.completedAt.getTime() + gracePeriodMs);
              dueBy = deadline.toISOString();
              if (new Date() > deadline) {
                status = 'overdue';
              }
            }

            const codeUpper = code.toUpperCase();
            items.push({
              category: 'document',
              type: code,
              label: config.label,
              enforcement: enforcement as BillingReadinessItem['enforcement'],
              status,
              relatedStopId: stop.id,
              relatedStopName: stopName,
              dueBy,
              reason: doc
                ? `${codeUpper} uploaded for ${stopName}`
                : status === 'overdue'
                  ? `${codeUpper} overdue for ${config.stopActionType} at ${stopName}`
                  : `${codeUpper} required for ${config.stopActionType} at ${stopName}`,
              satisfiedBy: doc
                ? {
                    documentId: doc.id,
                    fileName: doc.fileName,
                    uploadedAt: doc.createdAt.toISOString(),
                  }
                : undefined,
            });
          }
        }
      } else {
        // Load-level document
        const doc = documents.find((d) => d.documentType === code);
        items.push({
          category: 'document',
          type: code,
          label: config.label,
          enforcement: enforcement as BillingReadinessItem['enforcement'],
          status: doc ? 'satisfied' : 'missing',
          reason: doc ? `Uploaded ${doc.createdAt.toISOString().split('T')[0]}` : `${config.label} not uploaded`,
          satisfiedBy: doc
            ? {
                documentId: doc.id,
                fileName: doc.fileName,
                uploadedAt: doc.createdAt.toISOString(),
              }
            : undefined,
        });
      }
    }

    // --- Charge requirements ---

    const requireBillableCharge = (settingsRow as any)?.requireBillableCharge ?? true;
    const allowBillingOverride = (settingsRow as any)?.allowBillingOverride ?? false;

    if (requireBillableCharge) {
      const billableCharge = load.charges?.find((c: any) => c.isBillable);
      const totalBillable =
        load.charges?.filter((c: any) => c.isBillable).reduce((sum: number, c: any) => sum + c.totalCents, 0) ?? 0;

      items.push({
        category: 'charge',
        type: 'billable_charge',
        label: 'Billable Charge',
        enforcement: 'required',
        status: billableCharge ? 'satisfied' : 'missing',
        reason: billableCharge
          ? `Charges total: $${(totalBillable / 100).toFixed(2)}`
          : 'At least one billable charge is required',
        amountCents: totalBillable || undefined,
      });
    }

    // --- Calculate score ---
    // 'when_applicable' items are only included when applicable (checked above).
    // 'recommended' items are excluded from the required count.

    const requiredItems = items.filter((i) => i.enforcement !== 'recommended');
    const satisfiedItems = requiredItems.filter((i) => i.status === 'satisfied');
    const totalRequired = requiredItems.length;
    const totalSatisfied = satisfiedItems.length;
    const score = totalRequired > 0 ? Math.round((totalSatisfied / totalRequired) * 100) : 100;
    const hasBlockers = items.some((i) => i.status === 'overdue');

    // --- Check for existing override ---

    const existingOverride = await this.prisma.billingOverride.findFirst({
      where: { loadId: load.id, tenantId },
      orderBy: { createdAt: 'desc' as const },
      include: { user: { select: { firstName: true, lastName: true } } },
    });

    // Auto-transition billingStatus when readiness changes
    // Use updateMany with current status in WHERE clause (optimistic locking)
    // to prevent race conditions between concurrent evaluations
    if (score === 100 && load.billingStatus === 'PENDING_DOCUMENTS') {
      const { count } = await this.prisma.load.updateMany({
        where: { id: load.id, billingStatus: 'PENDING_DOCUMENTS' },
        data: { billingStatus: 'READY_FOR_REVIEW' },
      });
      if (count > 0) {
        await this.events.emit(SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED, load.tenantId, {
          entityId: load.loadNumber,
          entityType: 'load',
          loadNumber: load.loadNumber,
          billingStatus: 'READY_FOR_REVIEW',
        });
        this.logger.log(`Load ${loadNumber} auto-transitioned to READY_FOR_REVIEW (score 100%)`);
      }
    } else if (score < 100 && load.billingStatus === 'READY_FOR_REVIEW') {
      // Revert to PENDING_DOCUMENTS if docs were removed and score dropped
      const { count } = await this.prisma.load.updateMany({
        where: { id: load.id, billingStatus: 'READY_FOR_REVIEW' },
        data: { billingStatus: 'PENDING_DOCUMENTS' },
      });
      if (count > 0) {
        await this.events.emit(SALLY_EVENTS.LOAD_BILLING_STATUS_CHANGED, load.tenantId, {
          entityId: load.loadNumber,
          entityType: 'load',
          loadNumber: load.loadNumber,
          billingStatus: 'PENDING_DOCUMENTS',
        });
        this.logger.log(`Load ${loadNumber} reverted to PENDING_DOCUMENTS (score ${score}%)`);
      }
    }

    return {
      score,
      totalRequired,
      totalSatisfied,
      readyToApprove: score === 100,
      hasBlockers,
      items,
      overrideAllowed: allowBillingOverride,
      overrideExists: existingOverride
        ? {
            overriddenBy: (existingOverride as any).user
              ? `${(existingOverride as any).user.firstName} ${(existingOverride as any).user.lastName}`
              : 'Unknown',
            reason: existingOverride.reason,
            createdAt: existingOverride.createdAt.toISOString(),
          }
        : undefined,
    };
  }
}
