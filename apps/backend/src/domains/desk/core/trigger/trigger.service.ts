import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { EpisodeStatusSchema, OPEN_EPISODE_STATUSES, ResponsibilityKeySchema } from '@app/shared-types';

import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { DOMAIN_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { generateUuidV7 } from '../../../../shared/utils/uuidv7';
import { InngestClientService } from '../inngest/inngest.client';
import { findOverdueInvoicesForTenant } from '../../responsibilities/ar-followup/fan-out';
import { findUninvoicedDeliveredLoadsForTenant } from '../../responsibilities/closeout-review/fan-out';
import { findDriverExpiryFindingsForTenant } from '../../responsibilities/document-expiry/fan-out';
import { findDraftSettlementsForTenant } from '../../responsibilities/settlement-review/fan-out';
import { ShieldService } from '../../../operations/shield/services/shield.service';

// Canonical responsibility keys — imported from shared-types so the enum is
// the single source of truth, not a string literal repeated across the
// tenant trigger, enrichment, controller, and log lines.
const AR_FOLLOWUP = ResponsibilityKeySchema.enum.ar_followup;
const CLOSEOUT_REVIEW = ResponsibilityKeySchema.enum.closeout_review;
const DOCUMENT_EXPIRY = ResponsibilityKeySchema.enum.document_expiry;
const SETTLEMENT_REVIEW = ResponsibilityKeySchema.enum.settlement_review;
const EPISODE_STATUS = EpisodeStatusSchema.enum;

/**
 * TriggerService — the entry point that opens episodes + publishes Inngest
 * events for AR Follow-up runs.
 *
 * Two call paths:
 *   1. Manual run from the UI (POST /desk/responsibilities/:key/run).
 *      See ResponsibilityController in P1.11.
 *   2. Scheduled cron (added in a follow-up slice — P1.8 ships just the
 *      fan-out + publish path; a BullMQ repeatable job calls
 *      runForAllTenants() when wired).
 *
 * What happens per call:
 *   1. Resolve the DeskResponsibility row (by tenant + key).
 *   2. Snapshot trust + conditions + budget-limits onto new episodes
 *      (so mid-flight admin edits don't retroactively affect open runs).
 *   3. For each overdue entity (AR = overdue invoices), upsert a
 *      desk_episode row with a deterministic dedupeKey. The partial
 *      unique index enforces "one open episode per (responsibility, entity)".
 *   4. Publish `sally/desk.ar_followup.run` per new episode. Inngest
 *      idempotency on `id = episode.dedupeKey:<date>` rejects duplicate
 *      cron firings the same day.
 *
 * No LLM, no tool execution here — this is the entrypoint only. The
 * Inngest function (arFollowupFunction in P1.7) handles the actual episode.
 */
@Injectable()
export class TriggerService {
  private readonly logger = new Logger(TriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inngest: InngestClientService,
    private readonly config: ConfigService,
    private readonly shield: ShieldService,
    private readonly events: DomainEventService,
  ) {}

  /**
   * Run AR Follow-up for one tenant. Returns the number of episodes
   * opened (new or reused existing open episode).
   *
   * Called by the manual-trigger endpoint and (later) by the scheduled
   * cron processor.
   */
  async runArFollowupForTenant(tenantId: number): Promise<RunResult> {
    const responsibility = await this.prisma.deskResponsibility.findUnique({
      where: {
        tenantId_key: { tenantId, key: AR_FOLLOWUP },
      },
      select: {
        id: true,
        agentId: true,
        enabled: true,
        lifecycle: true,
        trustLevel: true,
        conditions: true,
        agent: { select: { supervisorUserId: true } },
      },
    });

    if (!responsibility) {
      this.logger.warn(`${AR_FOLLOWUP} not seeded for tenant ${tenantId}`);
      return { episodesOpened: 0, skipped: 'responsibility_not_seeded' };
    }
    if (!responsibility.enabled || responsibility.lifecycle !== 'AVAILABLE') {
      this.logger.log(
        `${AR_FOLLOWUP} disabled/coming_soon for tenant ${tenantId} (enabled=${responsibility.enabled}, lifecycle=${responsibility.lifecycle})`,
      );
      return {
        episodesOpened: 0,
        skipped: responsibility.enabled ? 'not_available' : 'disabled',
      };
    }
    // Refuse to fan out before the agent has a supervisor — the executeStep
    // pipeline requires a real DB id for `enabledByUserId` (auditId attribution).
    // Bootstrapping seeds responsibilities as enabled but does NOT set a
    // supervisor; gating here keeps the lifecycle-default behavior while
    // preventing the assertDbId throw downstream.
    if (responsibility.agent.supervisorUserId == null) {
      this.logger.warn(
        `${AR_FOLLOWUP} tenant ${tenantId}: agent has no supervisor — skipping. Assign a supervisor in /desk/agents.`,
      );
      return { episodesOpened: 0, skipped: 'no_supervisor' };
    }

    const allOverdue = await findOverdueInvoicesForTenant(this.prisma, tenantId);
    if (allOverdue.length === 0) {
      this.logger.log(`${AR_FOLLOWUP} tenant ${tenantId}: 0 overdue invoices`);
      return { episodesOpened: 0 };
    }

    // Safety cap to prevent fan-out from hammering the LLM API during
    // early-stage dev + debugging. Override via DESK_AR_FOLLOWUP_MAX_FANOUT
    // (0 or unset = no cap in prod). Read via ConfigService so we respect
    // the project's configuration pattern — no direct process.env in
    // domain code.
    const cap = this.config.get<number>('DESK_AR_FOLLOWUP_MAX_FANOUT', 0) ?? 0;
    const overdue = cap > 0 ? allOverdue.slice(0, cap) : allOverdue;
    if (cap > 0 && allOverdue.length > cap) {
      this.logger.warn(
        `${AR_FOLLOWUP} tenant ${tenantId}: capped at ${cap} of ${allOverdue.length} overdue invoices (DESK_AR_FOLLOWUP_MAX_FANOUT)`,
      );
    }

    const trigger = {
      kind: 'SCHEDULED' as const,
      label: 'AR Follow-up daily sweep',
      firedAt: new Date(),
      source: 'trigger.service',
    };

    let opened = 0;
    let reused = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const invoice of overdue) {
      const dedupeKey = `${AR_FOLLOWUP}:invoice:${invoice.invoiceNumber}`;
      // Include the invoice number so the dispatcher can cross-reference
      // without clicking into financials. Format: "<customer> · <invoice#> · $<amount> · <age>".
      const entityLabel = `${invoice.customerName} · ${invoice.invoiceNumber} · $${invoice.amount.toFixed(2)} · ${invoice.daysOverdue}d overdue`;
      const episode = await this.upsertEpisode({
        tenantId,
        responsibilityKey: AR_FOLLOWUP,
        entityType: 'invoice',
        entityId: invoice.invoiceNumber,
        entityLabel,
        responsibilityId: responsibility.id,
        ownerAgentId: responsibility.agentId,
        trustLevelSnapshot: responsibility.trustLevel,
        conditionsSnapshot: responsibility.conditions as Prisma.InputJsonValue,
        trigger,
        dedupeKey,
      });

      // An active suppression short-circuited the upsert — no episode was
      // opened or reused, and no Inngest event should fire. Counters skip.
      if ('skipped' in episode) {
        continue;
      }

      if (episode.isNew) {
        opened++;
      } else {
        reused++;
      }

      // Publish the Inngest event. Idempotency key includes the date so the
      // same episode can be triggered again tomorrow if its prior run closed.
      await this.inngest.send(
        'sally/desk.ar_followup.run',
        {
          episodeId: episode.id,
          tenantId,
          invoiceNumber: invoice.invoiceNumber,
          idempotencyKey: `${dedupeKey}:${today}`,
        },
        { id: `${dedupeKey}:${today}` },
      );
    }

    this.logger.log(
      `${AR_FOLLOWUP} tenant ${tenantId}: opened=${opened} reused=${reused} (${overdue.length} overdue invoices)`,
    );
    return { episodesOpened: opened, episodesReused: reused };
  }

  /**
   * Run Closeout Review for one tenant. Scans loads delivered 48h+ ago that
   * never got an invoice and opens an episode per load. Returns the number
   * of episodes opened (new or reused existing open episode).
   *
   * Called by the manual-trigger endpoint and (later) by the scheduled cron
   * processor. Mirrors runArFollowupForTenant — same guards (seeded,
   * enabled, available, supervisor assigned), same dedupe + suppression
   * semantics, different fan-out + entity shape.
   */
  async runCloseoutReviewForTenant(tenantId: number): Promise<RunResult> {
    const responsibility = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key: CLOSEOUT_REVIEW } },
      select: {
        id: true,
        agentId: true,
        enabled: true,
        lifecycle: true,
        trustLevel: true,
        conditions: true,
        agent: { select: { supervisorUserId: true } },
      },
    });

    if (!responsibility) {
      this.logger.warn(`${CLOSEOUT_REVIEW} not seeded for tenant ${tenantId}`);
      return { episodesOpened: 0, skipped: 'responsibility_not_seeded' };
    }
    if (!responsibility.enabled || responsibility.lifecycle !== 'AVAILABLE') {
      this.logger.log(
        `${CLOSEOUT_REVIEW} disabled/coming_soon for tenant ${tenantId} (enabled=${responsibility.enabled}, lifecycle=${responsibility.lifecycle})`,
      );
      return {
        episodesOpened: 0,
        skipped: responsibility.enabled ? 'not_available' : 'disabled',
      };
    }
    if (responsibility.agent.supervisorUserId == null) {
      this.logger.warn(
        `${CLOSEOUT_REVIEW} tenant ${tenantId}: agent has no supervisor — skipping. Assign a supervisor in /desk/agents.`,
      );
      return { episodesOpened: 0, skipped: 'no_supervisor' };
    }

    // minHoursSinceDelivery is operator-editable; default 48h. Pulled from
    // the snapshotted conditions so the fan-out window matches the tenant's
    // setting.
    const conditions = (responsibility.conditions ?? {}) as { minHoursSinceDelivery?: number };
    const allUninvoiced = await findUninvoicedDeliveredLoadsForTenant(this.prisma, tenantId, {
      minHoursSinceDelivery: conditions.minHoursSinceDelivery,
    });
    if (allUninvoiced.length === 0) {
      this.logger.log(`${CLOSEOUT_REVIEW} tenant ${tenantId}: 0 delivered-uninvoiced loads`);
      return { episodesOpened: 0 };
    }

    // Safety cap mirroring AR's — override via DESK_CLOSEOUT_MAX_FANOUT
    // (0 or unset = no cap).
    const cap = this.config.get<number>('DESK_CLOSEOUT_MAX_FANOUT', 0) ?? 0;
    const loads = cap > 0 ? allUninvoiced.slice(0, cap) : allUninvoiced;
    if (cap > 0 && allUninvoiced.length > cap) {
      this.logger.warn(
        `${CLOSEOUT_REVIEW} tenant ${tenantId}: capped at ${cap} of ${allUninvoiced.length} loads (DESK_CLOSEOUT_MAX_FANOUT)`,
      );
    }

    const trigger = {
      kind: 'SCHEDULED' as const,
      label: 'Closeout Review daily sweep',
      firedAt: new Date(),
      source: 'trigger.service',
    };

    let opened = 0;
    let reused = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const load of loads) {
      const dedupeKey = `${CLOSEOUT_REVIEW}:load:${load.loadNumber}`;
      const ageDays = Math.floor(load.hoursSinceDelivery / 24);
      const entityLabel = `${load.customerName} · ${load.loadNumber} · delivered ${ageDays}d ago`;
      const episode = await this.upsertEpisode({
        tenantId,
        responsibilityKey: CLOSEOUT_REVIEW,
        entityType: 'load',
        entityId: load.loadNumber,
        entityLabel,
        responsibilityId: responsibility.id,
        ownerAgentId: responsibility.agentId,
        trustLevelSnapshot: responsibility.trustLevel,
        conditionsSnapshot: responsibility.conditions as Prisma.InputJsonValue,
        trigger,
        dedupeKey,
      });

      if ('skipped' in episode) {
        continue;
      }

      if (episode.isNew) {
        opened++;
      } else {
        reused++;
      }

      await this.inngest.send(
        'sally/desk.closeout_review.run',
        {
          episodeId: episode.id,
          tenantId,
          loadNumber: load.loadNumber,
          idempotencyKey: `${dedupeKey}:${today}`,
        },
        { id: `${dedupeKey}:${today}` },
      );
    }

    this.logger.log(
      `${CLOSEOUT_REVIEW} tenant ${tenantId}: opened=${opened} reused=${reused} (${loads.length} delivered-uninvoiced loads)`,
    );
    return { episodesOpened: opened, episodesReused: reused };
  }

  /**
   * Run Document Expiry for one tenant. Acts on Shield's open DRIVERS
   * credential-expiry findings (CDL + medical card v1). Returns the number
   * of episodes opened (new or reused).
   *
   * Stale-audit guard: if the latest completed Shield audit is older than
   * the freshness window, skip the run, log, and trigger a fresh DRIVERS
   * audit rather than reminding off stale findings.
   *
   * Dedupe is on (driverId, credentialType) — NOT findingId — because
   * Shield re-creates findings with fresh ids each audit, so a findingId
   * key would re-open the same expiry daily.
   */
  async runDocumentExpiryForTenant(tenantId: number): Promise<RunResult> {
    const responsibility = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key: DOCUMENT_EXPIRY } },
      select: {
        id: true,
        agentId: true,
        enabled: true,
        lifecycle: true,
        trustLevel: true,
        conditions: true,
        agent: { select: { supervisorUserId: true } },
      },
    });

    if (!responsibility) {
      this.logger.warn(`${DOCUMENT_EXPIRY} not seeded for tenant ${tenantId}`);
      return { episodesOpened: 0, skipped: 'responsibility_not_seeded' };
    }
    if (!responsibility.enabled || responsibility.lifecycle !== 'AVAILABLE') {
      this.logger.log(
        `${DOCUMENT_EXPIRY} disabled/coming_soon for tenant ${tenantId} (enabled=${responsibility.enabled}, lifecycle=${responsibility.lifecycle})`,
      );
      return { episodesOpened: 0, skipped: responsibility.enabled ? 'not_available' : 'disabled' };
    }
    if (responsibility.agent.supervisorUserId == null) {
      this.logger.warn(
        `${DOCUMENT_EXPIRY} tenant ${tenantId}: agent has no supervisor — skipping. Assign a supervisor in /desk/agents.`,
      );
      return { episodesOpened: 0, skipped: 'no_supervisor' };
    }

    const fanOut = await findDriverExpiryFindingsForTenant(this.prisma, tenantId);

    // Stale-audit guard — don't act on stale findings. Trigger a fresh
    // DRIVERS audit and skip this run; the next sweep rides fresh findings.
    if (fanOut.status === 'stale_audit') {
      this.logger.warn(
        `${DOCUMENT_EXPIRY} tenant ${tenantId}: latest Shield audit is stale (${fanOut.lastCompletedAt?.toISOString() ?? 'none'}) — triggering audit, skipping run`,
      );
      await this.shield
        .triggerAudit({ tenantId, scope: 'DRIVERS', triggeredBy: 'SCHEDULED' })
        .catch((err) =>
          this.logger.warn(`${DOCUMENT_EXPIRY} tenant ${tenantId}: audit trigger failed: ${(err as Error).message}`),
        );
      return { episodesOpened: 0, skipped: 'stale_audit' };
    }

    if (fanOut.findings.length === 0) {
      this.logger.log(`${DOCUMENT_EXPIRY} tenant ${tenantId}: 0 open credential-expiry findings`);
      return { episodesOpened: 0 };
    }

    const cap = this.config.get<number>('DESK_DOC_EXPIRY_MAX_FANOUT', 0) ?? 0;
    const findings = cap > 0 ? fanOut.findings.slice(0, cap) : fanOut.findings;
    if (cap > 0 && fanOut.findings.length > cap) {
      this.logger.warn(
        `${DOCUMENT_EXPIRY} tenant ${tenantId}: capped at ${cap} of ${fanOut.findings.length} findings (DESK_DOC_EXPIRY_MAX_FANOUT)`,
      );
    }

    const trigger = {
      kind: 'SCHEDULED' as const,
      label: 'Document Expiry daily sweep',
      firedAt: new Date(),
      source: 'trigger.service',
    };

    let opened = 0;
    let reused = 0;
    const today = new Date().toISOString().slice(0, 10);
    const baseConditions = (responsibility.conditions ?? {}) as Record<string, unknown>;

    for (const finding of findings) {
      // Dedupe on (driver, credential) — stable across audits.
      const dedupeKey = `${DOCUMENT_EXPIRY}:driver:${finding.driverId}:${finding.credentialType}`;
      const datePhrase = finding.dueDate ? `expires ${finding.dueDate}` : 'expiry unknown';
      const entityLabel = `${finding.driverName} · ${finding.credentialLabel} · ${datePhrase} · ${finding.severity}`;

      // Stash the credentialType on the snapshot so hydrate re-queries the
      // exact credential's open finding (ids churn across audits).
      const conditionsSnapshot = {
        ...baseConditions,
        __credentialType: finding.credentialType,
      } as Prisma.InputJsonValue;

      const episode = await this.upsertEpisode({
        tenantId,
        responsibilityKey: DOCUMENT_EXPIRY,
        entityType: 'driver',
        entityId: finding.driverId,
        entityLabel,
        responsibilityId: responsibility.id,
        ownerAgentId: responsibility.agentId,
        trustLevelSnapshot: responsibility.trustLevel,
        conditionsSnapshot,
        trigger,
        dedupeKey,
      });

      if ('skipped' in episode) {
        continue;
      }
      if (episode.isNew) {
        opened++;
      } else {
        reused++;
      }

      await this.inngest.send(
        'sally/desk.document_expiry.run',
        {
          episodeId: episode.id,
          tenantId,
          driverId: finding.driverId,
          credentialType: finding.credentialType,
          idempotencyKey: `${dedupeKey}:${today}`,
        },
        { id: `${dedupeKey}:${today}` },
      );
    }

    this.logger.log(
      `${DOCUMENT_EXPIRY} tenant ${tenantId}: opened=${opened} reused=${reused} (${findings.length} findings)`,
    );
    return { episodesOpened: opened, episodesReused: reused };
  }

  /**
   * Run Settlement Review for one tenant. Returns the number of episodes
   * opened (new or reused). Called by the manual-trigger endpoint and the
   * weekly cron processor. Mirrors {@link runArFollowupForTenant} but fans out
   * over DRAFT settlements; per-settlement anomaly classification happens in
   * the hydrate step (fan-out stays cheap).
   */
  async runSettlementReviewForTenant(tenantId: number): Promise<RunResult> {
    const responsibility = await this.prisma.deskResponsibility.findUnique({
      where: { tenantId_key: { tenantId, key: SETTLEMENT_REVIEW } },
      select: {
        id: true,
        agentId: true,
        enabled: true,
        lifecycle: true,
        trustLevel: true,
        conditions: true,
        agent: { select: { supervisorUserId: true } },
      },
    });

    if (!responsibility) {
      this.logger.warn(`${SETTLEMENT_REVIEW} not seeded for tenant ${tenantId}`);
      return { episodesOpened: 0, skipped: 'responsibility_not_seeded' };
    }
    if (!responsibility.enabled || responsibility.lifecycle !== 'AVAILABLE') {
      this.logger.log(
        `${SETTLEMENT_REVIEW} disabled/coming_soon for tenant ${tenantId} (enabled=${responsibility.enabled}, lifecycle=${responsibility.lifecycle})`,
      );
      return { episodesOpened: 0, skipped: responsibility.enabled ? 'not_available' : 'disabled' };
    }
    // Refuse to fan out before the agent has a supervisor — execute needs a
    // real DB id for enabledByUserId (auditId attribution).
    if (responsibility.agent.supervisorUserId == null) {
      this.logger.warn(
        `${SETTLEMENT_REVIEW} tenant ${tenantId}: agent has no supervisor — skipping. Assign a supervisor in /desk/agents.`,
      );
      return { episodesOpened: 0, skipped: 'no_supervisor' };
    }

    const allDrafts = await findDraftSettlementsForTenant(this.prisma, tenantId);
    if (allDrafts.length === 0) {
      this.logger.log(`${SETTLEMENT_REVIEW} tenant ${tenantId}: 0 draft settlements`);
      return { episodesOpened: 0 };
    }

    // Safety cap to avoid hammering the LLM API during early dev. Override via
    // DESK_SETTLEMENT_MAX_FANOUT (0 or unset = no cap). Read via ConfigService.
    const cap = this.config.get<number>('DESK_SETTLEMENT_MAX_FANOUT', 0) ?? 0;
    const drafts = cap > 0 ? allDrafts.slice(0, cap) : allDrafts;
    if (cap > 0 && allDrafts.length > cap) {
      this.logger.warn(
        `${SETTLEMENT_REVIEW} tenant ${tenantId}: capped at ${cap} of ${allDrafts.length} draft settlements (DESK_SETTLEMENT_MAX_FANOUT)`,
      );
    }

    const trigger = {
      kind: 'SCHEDULED' as const,
      label: 'Settlement Review weekly sweep',
      firedAt: new Date(),
      source: 'trigger.service',
    };

    let opened = 0;
    let reused = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const settlement of drafts) {
      const dedupeKey = `${SETTLEMENT_REVIEW}:settlement:${settlement.settlementId}`;
      const entityLabel = `${settlement.driverName} · ${settlement.settlementNumber} · net $${(settlement.netPayCents / 100).toFixed(2)}`;
      const episode = await this.upsertEpisode({
        tenantId,
        responsibilityKey: SETTLEMENT_REVIEW,
        entityType: 'settlement',
        entityId: settlement.settlementId,
        responsibilityId: responsibility.id,
        ownerAgentId: responsibility.agentId,
        trustLevelSnapshot: responsibility.trustLevel,
        conditionsSnapshot: responsibility.conditions as Prisma.InputJsonValue,
        trigger,
        entityLabel,
        dedupeKey,
      });

      if ('skipped' in episode) {
        continue;
      }

      if (episode.isNew) {
        opened++;
      } else {
        reused++;
      }

      await this.inngest.send(
        'sally/desk.settlement_review.run',
        {
          episodeId: episode.id,
          tenantId,
          settlementId: settlement.settlementId,
          idempotencyKey: `${dedupeKey}:${today}`,
        },
        { id: `${dedupeKey}:${today}` },
      );
    }

    this.logger.log(
      `${SETTLEMENT_REVIEW} tenant ${tenantId}: opened=${opened} reused=${reused} (${drafts.length} draft settlements)`,
    );
    return { episodesOpened: opened, episodesReused: reused };
  }

  /**
   * Generic dispatch — run whichever responsibility `key` names for one
   * tenant. Switches to the responsibility-specific `run<X>ForTenant`
   * method so callers (the scheduler heartbeat, future generic entrypoints)
   * stay responsibility-agnostic. Each target method owns its own guards
   * (seeded / enabled / AVAILABLE / supervisor), so this layer only routes.
   *
   * Throws BadRequestException for a key with no wired run method — the
   * caller logs and moves on rather than silently no-op'ing a typo.
   *
   * `key` is typed `string` (not `ResponsibilityKey`) because callers pass it
   * straight off the DB `desk_responsibilities.key` column; the switch is the
   * single point that narrows a raw string to a known responsibility.
   */
  async runByKey(key: string, tenantId: number): Promise<RunResult> {
    switch (key) {
      case AR_FOLLOWUP:
        return this.runArFollowupForTenant(tenantId);
      case CLOSEOUT_REVIEW:
        return this.runCloseoutReviewForTenant(tenantId);
      case DOCUMENT_EXPIRY:
        return this.runDocumentExpiryForTenant(tenantId);
      case SETTLEMENT_REVIEW:
        return this.runSettlementReviewForTenant(tenantId);
      default:
        throw new BadRequestException(`No run method wired for responsibility ${key}`);
    }
  }

  /**
   * Upsert an episode using the partial unique index on dedupeKey. If an
   * open episode already exists for the same (tenantId, dedupeKey), we
   * reuse it rather than failing — matches the "recurring triggers wake
   * existing episodes" semantics from design doc §Q3.
   *
   * Before the upsert, we consult `desk_entity_suppressions` (T27f). An
   * active, unexpired, unsuppressed row short-circuits the trigger — the
   * caller does not count this as opened or reused and does NOT publish
   * an Inngest event for this entity. Snooze state is durable across
   * scheduled sweeps until the user un-snoozes or the window elapses.
   */
  private async upsertEpisode(input: {
    tenantId: number;
    responsibilityKey: string;
    entityType: string;
    entityId: string;
    /** Human-readable label shown on the episode card; responsibility-shaped. */
    entityLabel: string;
    responsibilityId: number;
    ownerAgentId: number;
    trustLevelSnapshot: 'SUPERVISED' | 'ASSISTED' | 'AUTONOMOUS';
    conditionsSnapshot: Prisma.InputJsonValue;
    trigger: {
      kind: 'SCHEDULED' | 'DOMAIN_EVENT' | 'WEBHOOK' | 'MANUAL';
      label: string;
      source: string;
      firedAt: Date;
    };
    dedupeKey: string;
  }): Promise<{ id: string; isNew: boolean } | { skipped: 'suppressed'; suppressionId: string }> {
    // Suppression skip — covered by the partial index
    // `idx_desk_entity_suppressions_lookup` (WHERE unsuppressed_at IS NULL).
    const activeSuppression = await this.prisma.deskEntitySuppression.findFirst({
      where: {
        tenantId: input.tenantId,
        responsibilityKey: input.responsibilityKey,
        entityType: input.entityType,
        entityId: input.entityId,
        unsuppressedAt: null,
        OR: [{ suppressUntil: null }, { suppressUntil: { gt: new Date() } }],
      },
      select: { id: true, suppressUntil: true },
    });
    if (activeSuppression) {
      this.logger.log(
        `desk-trigger-skipped-suppressed tenant=${input.tenantId} dedupe=${input.dedupeKey} until=${activeSuppression.suppressUntil?.toISOString() ?? 'forever'}`,
      );
      return { skipped: 'suppressed', suppressionId: activeSuppression.id };
    }

    // Look for an already-open episode for this entity. The partial unique
    // index enforces uniqueness on (tenantId, dedupeKey) WHERE status IN
    // ('RUNNING', 'WAITING_APPROVAL'), but we do the read first so we can
    // return isNew correctly.
    const existing = await this.prisma.deskEpisode.findFirst({
      where: {
        tenantId: input.tenantId,
        dedupeKey: input.dedupeKey,
        status: { in: [...OPEN_EPISODE_STATUSES] },
      },
      select: { id: true },
    });
    if (existing) {
      return { id: existing.id, isNew: false };
    }

    const created = await this.prisma.deskEpisode.create({
      data: {
        id: generateUuidV7(),
        tenantId: input.tenantId,
        responsibilityId: input.responsibilityId,
        ownerAgentId: input.ownerAgentId,
        trustLevelSnapshot: input.trustLevelSnapshot,
        conditionsSnapshot: input.conditionsSnapshot,
        triggerKind: input.trigger.kind,
        triggerLabel: input.trigger.label,
        triggerSource: input.trigger.source,
        triggerFiredAt: input.trigger.firedAt,
        entityType: input.entityType,
        entityId: input.entityId,
        entityLabel: input.entityLabel,
        status: EPISODE_STATUS.RUNNING,
        dedupeKey: input.dedupeKey,
        // Inngest owns the temporal_workflow_id field conceptually;
        // we store the dedupe key for a stable cross-system reference the
        // UI can deep-link to.
        temporalWorkflowId: `inngest:${input.dedupeKey}`,
      },
      select: { id: true },
    });

    // A new episode opened — tell the Desk UI to refresh the Needs-you list +
    // handoff counts live. This is the fix for the manual-run staleness bug:
    // the count query refetched but the list didn't, because the open path
    // emitted no cache/SSE signal. Best-effort — never fail the trigger on a
    // dropped event.
    await this.events
      .emit(DOMAIN_EVENTS.DESK_EPISODE_CHANGED, input.tenantId, {
        tenantId: input.tenantId,
        episodeId: created.id,
        status: EPISODE_STATUS.RUNNING,
      })
      .catch((err) =>
        this.logger.warn(`DESK_EPISODE_CHANGED emit failed for ${created.id}: ${(err as Error).message}`),
      );

    return { id: created.id, isNew: true };
  }
}

export interface RunResult {
  episodesOpened: number;
  episodesReused?: number;
  skipped?: 'responsibility_not_seeded' | 'not_available' | 'disabled' | 'no_supervisor' | 'stale_audit';
}
