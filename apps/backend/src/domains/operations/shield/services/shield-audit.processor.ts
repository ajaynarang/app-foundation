import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { ShieldAuditStatus } from '@prisma/client';
import type { JobEnvelope } from '@sally/shared-types';
import type { QueueJobHandler } from '../../../../infrastructure/queue/job-handler.contract';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { InAppNotificationService } from '../../notifications/notifications.service';
import { QUEUE_NAMES, SAFETY_DETECT_JOB_NAMES } from '../../../../infrastructure/queue/queue.constants';
import { JobService } from '../../../../infrastructure/queue/job.service';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { ShieldRuleEngine } from './shield-rule-engine.service';
import { ShieldAIAnalyst } from './shield-ai-analyst.service';
import {
  ShieldAuditJobPayload,
  ShieldCategoryResult,
  ShieldCoverageItem,
  ShieldFindingInput,
  computeCategoryScore,
  computeOverallScore,
  computeStatusLabel,
  SHIELD_AUDIT_JOB,
} from '../shield.types';
import { generateUuidV7 } from '../../../../shared/utils/uuidv7';
import { TimezoneService } from '../../../../shared/services/timezone.service';
import { TenantJobRunService } from '../../../../shared/services/tenant-job-run.service';
import { DIGEST_LOCAL_HOUR, TENANT_JOB_KEYS } from '../../../../shared/constants/scheduling.constants';

interface AuditJobData extends ShieldAuditJobPayload {
  auditId: string;
  jobId?: number;
  isCronJob?: boolean;
}

/**
 * Handler for `SAFETY_DETECT_JOB_NAMES.AUDIT` on the shared SAFETY_DETECT queue.
 * Routed to by the single SafetyDetectQueueProcessor dispatcher; the sibling
 * `load-monitoring` job is owned by LoadMonitoringJobHandler. Payloads are
 * wrapped in the standard `JobEnvelope`.
 */
/**
 * Owns the `audit` job name on the `safety-detect` queue. A plain handler — the
 * single SafetyDetectQueueProcessor dispatcher routes jobs to it by name, so
 * there is no competing-consumer race (which previously stranded scheduled
 * audits in QUEUED forever) and no per-handler job-name guard or dead-letter.
 */
@Injectable()
export class ShieldAuditJobHandler implements QueueJobHandler {
  readonly jobNames = [SAFETY_DETECT_JOB_NAMES.AUDIT];
  private readonly logger = new Logger(ShieldAuditJobHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: ShieldRuleEngine,
    private readonly aiAnalyst: ShieldAIAnalyst,
    private readonly events: DomainEventService,
    private readonly notificationService: InAppNotificationService,
    private readonly jobService: JobService,
    @InjectQueue(QUEUE_NAMES.SAFETY_DETECT)
    private readonly shieldQueue: Queue,
    private readonly timezoneService: TimezoneService,
    private readonly tenantJobRun: TenantJobRunService,
  ) {}

  async run(job: Job<JobEnvelope<AuditJobData>>) {
    const data = job.data?.payload;
    if (!data) {
      this.logger.warn(`Shield audit job ${job.id} missing envelope payload — skipping`);
      return;
    }

    // Cron job: dispatch individual audits for all tenants with shield flag enabled
    if (data.isCronJob) {
      const flag = await this.prisma.featureFlag.findUnique({
        where: { key: 'shield' },
        select: { enabled: true },
      });
      if (!flag?.enabled) return;

      const tenants = await this.prisma.tenant.findMany({
        where: { status: 'ACTIVE', jobsPaused: false },
        select: { id: true },
      });

      const now = new Date();
      for (const tenant of tenants) {
        // Fire only at the tenant-local audit hour, once per local day.
        const tz = await this.timezoneService.resolveTenantTimezone(tenant.id);
        if (this.timezoneService.localHour(tz, now) !== DIGEST_LOCAL_HOUR) continue;
        const localToday = this.timezoneService.localDate(tz, now);
        if (await this.tenantJobRun.hasRunOn(tenant.id, TENANT_JOB_KEYS.SHIELD_AUDIT, localToday)) continue;

        const settings = await this.prisma.fleetOperationsSettings.findUnique({
          where: { tenantId: tenant.id },
          select: {
            shieldAiEnabled: true,
            shieldCustomRulesEnabled: true,
            shieldAuditPeriodDays: true,
          },
        });

        const auditPeriodDays = settings?.shieldAuditPeriodDays ?? 30;

        const audit = await this.prisma.shieldAudit.create({
          data: {
            id: generateUuidV7(),
            tenantId: tenant.id,
            scope: 'FULL',
            status: 'QUEUED',
            triggeredBy: 'SCHEDULED',
            includeAi: settings?.shieldAiEnabled ?? true,
            auditPeriodDays,
          },
        });

        // Create Job record for System Activity tracking
        const sysJob = await this.jobService.createJob({
          tenantId: tenant.id,
          submittedBy: null,
          category: SHIELD_AUDIT_JOB.category,
          type: SHIELD_AUDIT_JOB.type,
          inputData: {
            auditId: audit.id,
            scope: 'FULL',
            triggeredBy: 'SCHEDULED',
          },
          maxAttempts: 2,
        });

        await this.shieldQueue.add(
          SAFETY_DETECT_JOB_NAMES.AUDIT,
          buildJobEnvelope<AuditJobData>(
            {
              tenantId: tenant.id,
              scope: 'FULL',
              triggeredBy: 'SCHEDULED',
              auditId: audit.id,
              jobId: sysJob.id,
              includeAi: settings?.shieldAiEnabled ?? true,
              includeCustomRules: settings?.shieldCustomRulesEnabled ?? true,
              auditPeriodDays,
            },
            {
              tenantId: String(tenant.id),
              source: 'cron',
            },
          ),
        );

        // Idempotency stamp — record tenant-local date so hourly wake-ups fire once/day.
        await this.tenantJobRun.markRanOn(tenant.id, TENANT_JOB_KEYS.SHIELD_AUDIT, localToday);
      }
      return;
    }

    const { tenantId, scope, auditId, jobId, auditPeriodDays = 30 } = data;

    if (job.data?.correlationId) {
      this.logger.log(`Processing ${job.name} [correlation: ${job.data.correlationId}]`);
    }

    if (!tenantId) {
      this.logger.warn(`Skipping shield audit job ${job.id} — missing tenantId (stale repeatable job?)`);
      return;
    }

    // Skip if tenant has paused jobs
    const tenantCheck = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { jobsPaused: true },
    });
    if (tenantCheck?.jobsPaused) {
      this.logger.log(`Skipping shield audit — tenant ${tenantId} is paused`);
      if (jobId)
        await this.jobService.markCompleted(jobId, {
          skipped: 'tenant_paused',
        });
      return;
    }

    // Guard: a user (or auto-heal) may have cancelled this audit between enqueue
    // and dequeue. Don't resurrect a cancelled audit by producing findings.
    const current = await this.prisma.shieldAudit.findUnique({
      where: { id: auditId },
      select: { status: true },
    });
    if (!current || current.status === ShieldAuditStatus.CANCELLED) {
      this.logger.log(`Skipping shield audit ${auditId} — ${current ? 'cancelled' : 'no longer exists'}`);
      if (jobId) await this.jobService.markCompleted(jobId, { skipped: 'cancelled' });
      return;
    }

    const startTime = Date.now();

    this.logger.log(`Processing shield audit ${auditId} (scope: ${scope}, tenant: ${tenantId})`);

    // Track in both ShieldAudit and Job tables
    await this.prisma.shieldAudit.update({
      where: { id: auditId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (jobId) await this.jobService.markProcessing(jobId);

    try {
      // Phase 1: Rule Engine
      const results: ShieldCategoryResult[] = [];

      if (scope === 'FULL') {
        const [hos, drivers, vehicles, loads] = await Promise.all([
          this.ruleEngine.checkHOS(tenantId),
          this.ruleEngine.checkDrivers(tenantId),
          this.ruleEngine.checkVehicles(tenantId),
          this.ruleEngine.checkLoads(tenantId, auditPeriodDays),
        ]);
        results.push(hos, drivers, vehicles, loads);
      } else {
        const checkMap = {
          HOS: () => this.ruleEngine.checkHOS(tenantId),
          DRIVERS: () => this.ruleEngine.checkDrivers(tenantId),
          VEHICLES: () => this.ruleEngine.checkVehicles(tenantId),
          LOADS: () => this.ruleEngine.checkLoads(tenantId, auditPeriodDays),
        };
        results.push(await checkMap[scope]());
      }

      const allFindings: ShieldFindingInput[] = results.flatMap((r) => r.findings);

      // Phase 1b: Cross-entity checks
      if (scope === 'FULL') {
        const crossEntityFindings = await this.ruleEngine.checkCrossEntity(tenantId);
        allFindings.push(...crossEntityFindings);
        // Add cross-entity findings to drivers category score
        if (crossEntityFindings.length > 0) {
          const driversResult = results.find((r) => r.category === 'DRIVERS');
          if (driversResult) {
            driversResult.findings.push(...crossEntityFindings);
            driversResult.score = computeCategoryScore(driversResult.findings);
          }
        }
      }

      // Aggregate coverage from all categories
      const coverage = results.reduce(
        (acc, result) => {
          if (result.coverage) {
            acc[result.category] = result.coverage;
          }
          return acc;
        },
        {} as Record<string, ShieldCoverageItem[]>,
      );

      // Phase 2: AI Analysis (if enabled and scope is FULL)
      let aiSummary: string | null = null;
      let aiInsights: any[] | null = null;
      let aiActions: any[] | null = null;
      let aiModelUsed: string | null = null;
      let aiDurationMs: number | null = null;
      let aiSkippedRules: any[] | null = null;

      const shouldRunAi = data.includeAi !== false && scope === 'FULL';

      if (shouldRunAi) {
        try {
          // Fetch custom rules if enabled
          let customRules: string[] = [];
          if (data.includeCustomRules !== false) {
            const rules = await this.prisma.shieldCustomRule.findMany({
              where: { tenantId, isActive: true },
              select: { rule: true },
            });
            customRules = rules.map((r) => r.rule);
          }

          const aiResult = await this.aiAnalyst.analyze(tenantId, allFindings, customRules, auditPeriodDays);

          aiSummary = aiResult.response.summary;
          aiInsights = aiResult.response.insights;
          aiActions = aiResult.response.priorityActions;
          aiModelUsed = aiResult.modelUsed;
          aiDurationMs = aiResult.durationMs;
          aiSkippedRules = aiResult.response.skippedRules ?? null;

          // Add AI findings to allFindings (truncate to fit DB column limits)
          for (const f of aiResult.response.findings) {
            allFindings.push({
              category: f.category,
              severity: f.severity,
              title: (f.title || '').slice(0, 200),
              description: f.description,
              entityType: f.entityType?.slice(0, 20),
              entityId: f.entityId?.slice(0, 50),
              entityName: f.entityName?.slice(0, 100),
              impact: f.impact,
              recommendation: f.recommendation,
              regulation: f.regulation?.slice(0, 50),
              source: f.isCustomRuleMatch ? 'CUSTOM' : 'AI',
              metadata: f.sourceRule ? { sourceRule: f.sourceRule } : undefined,
            });
          }

          this.logger.log(
            `Shield AI analysis completed: model=${aiResult.modelUsed}, duration=${aiResult.durationMs}ms, ai_findings=${aiResult.response.findings.length}`,
          );
        } catch (aiError) {
          // AI failure is non-fatal — rule engine findings still saved
          this.logger.warn(
            `Shield AI analysis failed (non-fatal): ${aiError instanceof Error ? aiError.message : aiError}`,
          );
        }
      }

      // Recalculate scores including AI findings
      const categoryScores: Partial<Record<'HOS' | 'DRIVERS' | 'VEHICLES' | 'LOADS', number>> = {};
      for (const r of results) {
        categoryScores[r.category] = r.score;
      }

      // If AI added findings, recalculate category scores
      if (shouldRunAi && aiModelUsed) {
        const aiFindingsByCategory = allFindings
          .filter((f) => f.source === 'AI' || f.source === 'CUSTOM')
          .reduce(
            (acc, f) => {
              if (!acc[f.category]) acc[f.category] = [];
              acc[f.category].push(f);
              return acc;
            },
            {} as Record<string, ShieldFindingInput[]>,
          );

        for (const [cat, aiFindingsInCat] of Object.entries(aiFindingsByCategory)) {
          const existingScore = categoryScores[cat as keyof typeof categoryScores] ?? 100;
          let deductions = 0;
          for (const f of aiFindingsInCat) {
            if (f.severity === 'CRITICAL') deductions += 15;
            else if (f.severity === 'WARNING') deductions += 5;
          }
          categoryScores[cat as keyof typeof categoryScores] = Math.max(0, existingScore - deductions);
        }
      }

      const overallScore = computeOverallScore(categoryScores);

      // Save findings
      if (allFindings.length > 0) {
        await this.prisma.shieldFinding.createMany({
          data: allFindings.map((f) => ({
            id: generateUuidV7(),
            auditId,
            tenantId,
            category: f.category,
            severity: f.severity,
            title: f.title,
            description: f.description,
            entityType: f.entityType,
            entityId: f.entityId,
            entityName: f.entityName,
            impact: f.impact,
            recommendation: f.recommendation,
            dueDate: f.dueDate,
            source: f.source ?? 'RULE',
            regulation: f.regulation,
            metadata: f.metadata ? (f.metadata as any) : undefined,
          })),
        });
      }

      const durationMs = Date.now() - startTime;

      await this.prisma.shieldAudit.update({
        where: { id: auditId },
        data: {
          status: 'COMPLETED',
          overallScore,
          hosScore: categoryScores.HOS ?? null,
          driversScore: categoryScores.DRIVERS ?? null,
          vehiclesScore: categoryScores.VEHICLES ?? null,
          loadsScore: categoryScores.LOADS ?? null,
          statusLabel: computeStatusLabel(overallScore),
          completedAt: new Date(),
          durationMs,
          auditPeriodDays,
          aiSummary,
          aiInsights: aiInsights as any,
          aiActions: aiActions as any,
          aiModelUsed,
          aiDurationMs,
          aiSkippedRules: aiSkippedRules as any,
          coverage: coverage as any,
        },
      });

      await this.events.emit(SALLY_EVENTS.SHIELD_AUDIT_COMPLETE, tenantId, {
        entityId: auditId,
        entityType: 'shield-audit',
        auditId,
        overallScore,
        statusLabel: computeStatusLabel(overallScore),
        findingsCount: allFindings.length,
      });

      // Send notification if any CRITICAL findings
      const criticalCount = allFindings.filter((f) => f.severity === 'CRITICAL').length;
      if (criticalCount > 0) {
        try {
          const users = await this.prisma.user.findMany({
            where: { tenantId, role: { in: ['OWNER', 'ADMIN', 'DISPATCHER'] } },
            select: { id: true },
          });

          for (const user of users) {
            await this.notificationService.create({
              recipientId: user.id,
              tenantId,
              type: 'SHIELD_AUDIT_CRITICAL',
              category: 'SYSTEM',
              title: `Shield audit complete: ${overallScore}/100`,
              message: `${criticalCount} critical finding${criticalCount !== 1 ? 's' : ''} need attention.`,
              actionUrl: '/dispatcher/shield',
              actionLabel: 'View Shield',
              iconType: 'shield',
              metadata: { auditId, overallScore, criticalCount },
            });
          }
        } catch (notifyError) {
          this.logger.warn(`Failed to send Shield notification (non-fatal): ${notifyError}`);
        }
      }

      // Mark Job as completed in System Activity
      if (jobId) {
        await this.jobService.markCompleted(jobId, {
          auditId,
          overallScore,
          findingsCount: allFindings.length,
          aiModelUsed,
        });
      }

      // Post result to Sally AI conversation if triggered from chat
      if (data.conversationId) {
        try {
          const statusLabel = computeStatusLabel(overallScore);
          const criticals = allFindings.filter((f) => f.severity === 'CRITICAL').length;
          const warnings = allFindings.filter((f) => f.severity === 'WARNING').length;
          const summaryText = aiSummary
            ? `**Shield Audit Complete — Score: ${overallScore}/100 (${statusLabel})**\n\n${aiSummary}\n\n📊 ${allFindings.length} findings: ${criticals} critical, ${warnings} warnings`
            : `**Shield Audit Complete — Score: ${overallScore}/100 (${statusLabel})**\n\n📊 ${allFindings.length} findings: ${criticals} critical, ${warnings} warnings\n\nView the full report in the Shield dashboard.`;

          const conversation = await this.prisma.conversation.findUnique({
            where: { conversationId: data.conversationId },
          });
          if (conversation) {
            await this.prisma.conversationMessage.create({
              data: {
                messageId: `msg-async-${Date.now()}`,
                conversation: { connect: { id: conversation.id } },
                role: 'assistant',
                content: summaryText,
                inputMode: 'text',
                card: {
                  type: 'shield_audit_result',
                  data: {
                    auditId,
                    overallScore,
                    statusLabel,
                    findingsCount: allFindings.length,
                    criticalCount: criticals,
                    warningCount: warnings,
                    aiModelUsed,
                  },
                } as any,
              },
            });

            // Emit SSE event so frontend shows unread indicator on Sally orb
            await this.events.emit(SALLY_EVENTS.SHIELD_AUDIT_COMPLETE, tenantId, {
              entityId: auditId,
              entityType: 'shield-audit',
              auditId,
              overallScore,
              statusLabel,
              findingsCount: allFindings.length,
              conversationId: data.conversationId,
              asyncFollowUp: true,
            });
          }
        } catch (followUpError) {
          this.logger.warn(`Failed to post Shield result to conversation (non-fatal): ${followUpError}`);
        }
      }

      this.logger.log(
        `Shield audit ${auditId} completed: score=${overallScore}, findings=${allFindings.length}, duration=${durationMs}ms${aiModelUsed ? `, ai=${aiModelUsed}` : ''}`,
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      await this.prisma.shieldAudit.update({
        where: { id: auditId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
          durationMs,
          errorMessage,
        },
      });

      // Mark Job as failed in System Activity
      if (jobId) {
        await this.jobService.markFailed(jobId, errorMessage);
      }

      await this.events.emit(SALLY_EVENTS.SHIELD_AUDIT_FAILED, tenantId, {
        entityId: auditId,
        entityType: 'shield-audit',
        auditId,
      });

      throw error;
    }
  }
}
