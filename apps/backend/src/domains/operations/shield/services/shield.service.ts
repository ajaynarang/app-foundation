import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma, ShieldAuditStatus } from '@prisma/client';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { CACHE_TTL_WARM_5M, CACHE_TTL_FROZEN_1H } from '../../../../constants/cache.constants';
import { buildDateRangeFilter } from '../../../../shared/utils/date-range';
import { JobService } from '../../../../infrastructure/queue/job.service';
import {
  QUEUE_NAMES,
  SAFETY_DETECT_JOB_NAMES,
  bullJobIdFromDbId,
} from '../../../../infrastructure/queue/queue.constants';
import { buildJobEnvelope } from '../../../../infrastructure/queue/job-envelope.helper';
import { ShieldAuditJobPayload, STALE_AUDIT_TIMEOUT_MS, SHIELD_AUDIT_JOB } from '../shield.types';
import { requestContextStorage } from '../../../../infrastructure/logging/request-context.middleware';
import { generateUuidV7 } from '../../../../shared/utils/uuidv7';

/** Non-terminal audit statuses — an audit in one of these is still "in flight". */
const IN_PROGRESS_STATUSES: ShieldAuditStatus[] = [ShieldAuditStatus.QUEUED, ShieldAuditStatus.RUNNING];

@Injectable()
export class ShieldService {
  private readonly logger = new Logger(ShieldService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SallyCacheService,
    private readonly jobService: JobService,
    @InjectQueue(QUEUE_NAMES.SAFETY_DETECT) private readonly auditQueue: Queue,
  ) {}

  async getLatestAudit(tenantId: number) {
    return this.cache.getOrSet(
      buildKey('sally:shield', 'results', tenantId),
      async () => {
        const audit = await this.prisma.shieldAudit.findFirst({
          where: { tenantId, status: 'COMPLETED' },
          orderBy: { completedAt: 'desc' },
          include: {
            findings: {
              where: { isResolved: false },
              orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
            },
          },
        });

        return audit;
      },
      CACHE_TTL_FROZEN_1H,
    );
  }

  /**
   * WHERE clause for a *live* in-progress audit: QUEUED/RUNNING and created
   * within the stale window. Orphaned rows (worker never ran, or died mid-run)
   * age out of this and are no longer treated as in-progress, so the banner
   * self-clears and a new run is allowed. Single source of truth for both
   * `getInProgressAudit` (banner) and `triggerAudit` (duplicate guard).
   */
  private liveInProgressWhere(tenantId: number): Prisma.ShieldAuditWhereInput {
    return {
      tenantId,
      status: { in: IN_PROGRESS_STATUSES },
      createdAt: { gte: new Date(Date.now() - STALE_AUDIT_TIMEOUT_MS) },
    };
  }

  async getInProgressAudit(tenantId: number) {
    return this.prisma.shieldAudit.findFirst({
      where: this.liveInProgressWhere(tenantId),
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLastFailedAudit(tenantId: number) {
    return this.prisma.shieldAudit.findFirst({
      where: { tenantId, status: 'FAILED' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, createdAt: true },
    });
  }

  async getLatestScores(tenantId: number) {
    return this.cache.getOrSet(
      buildKey('sally:shield', 'score', tenantId),
      () => this.computeLatestScores(tenantId),
      CACHE_TTL_WARM_5M,
    );
  }

  private async computeLatestScores(tenantId: number) {
    // Get the most recent FULL audit as the baseline
    const latestFull = await this.prisma.shieldAudit.findFirst({
      where: { tenantId, status: 'COMPLETED', scope: 'FULL' },
      orderBy: { completedAt: 'desc' },
      select: {
        overallScore: true,
        hosScore: true,
        driversScore: true,
        vehiclesScore: true,
        loadsScore: true,
        statusLabel: true,
        completedAt: true,
        scope: true,
      },
    });

    // Check for more recent per-entity audits that may have newer scores
    const scoreFields = {
      HOS: 'hosScore',
      DRIVERS: 'driversScore',
      VEHICLES: 'vehiclesScore',
      LOADS: 'loadsScore',
    } as const;

    const result = {
      overallScore: latestFull?.overallScore ?? null,
      hosScore: latestFull?.hosScore ?? null,
      driversScore: latestFull?.driversScore ?? null,
      vehiclesScore: latestFull?.vehiclesScore ?? null,
      loadsScore: latestFull?.loadsScore ?? null,
      statusLabel: latestFull?.statusLabel ?? null,
      completedAt: latestFull?.completedAt ?? null,
    };

    const fullCompletedAt = latestFull?.completedAt;

    for (const [scope, field] of Object.entries(scoreFields)) {
      const latestEntity = await this.prisma.shieldAudit.findFirst({
        where: { tenantId, status: 'COMPLETED', scope: scope as any },
        orderBy: { completedAt: 'desc' },
        select: { [field]: true, completedAt: true },
      });

      const entityCompletedAt = (latestEntity as any)?.completedAt as Date | null;
      if (entityCompletedAt && (!fullCompletedAt || entityCompletedAt > fullCompletedAt)) {
        (result as any)[field] = (latestEntity as any)[field];
      }
    }

    return result;
  }

  async triggerAudit(payload: ShieldAuditJobPayload) {
    // A genuinely-live audit blocks a new run; a stale orphan does not.
    const running = await this.prisma.shieldAudit.findFirst({
      where: this.liveInProgressWhere(payload.tenantId),
    });

    if (running) {
      return {
        queued: false,
        message: 'An audit is already in progress',
        auditId: running.id,
      };
    }

    // Auto-heal: clear any orphaned QUEUED/RUNNING rows so they don't linger as
    // zombies in history (the worker also guards against running a healed job).
    await this.healStaleAudits(payload.tenantId);

    const audit = await this.prisma.shieldAudit.create({
      data: {
        id: generateUuidV7(),
        tenantId: payload.tenantId,
        scope: payload.scope,
        status: 'QUEUED',
        triggeredBy: payload.triggeredBy,
        triggeredById: payload.triggeredById,
        includeAi: payload.includeAi ?? true,
        auditPeriodDays: payload.auditPeriodDays ?? 30,
      },
    });

    // Create Job record for System Activity tracking
    const job = await this.jobService.createJob({
      tenantId: payload.tenantId,
      submittedBy: payload.triggeredById ?? null,
      category: SHIELD_AUDIT_JOB.category,
      type: SHIELD_AUDIT_JOB.type,
      inputData: {
        auditId: audit.id,
        scope: payload.scope,
        triggeredBy: payload.triggeredBy,
      },
      maxAttempts: 2,
    });

    const correlationId = requestContextStorage.getStore()?.requestId;
    await this.auditQueue.add(
      SAFETY_DETECT_JOB_NAMES.AUDIT,
      buildJobEnvelope(
        { ...payload, auditId: audit.id, jobId: job.id },
        {
          tenantId: String(payload.tenantId),
          source: 'api',
          correlationId,
          userId: payload.triggeredById != null ? String(payload.triggeredById) : undefined,
        },
      ),
      {
        jobId: bullJobIdFromDbId('safety', job.id),
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
      },
    );

    this.logger.log(`Shield audit queued: ${audit.id} (scope: ${payload.scope}, tenant: ${payload.tenantId})`);

    return { queued: true, auditId: audit.id };
  }

  /**
   * Flip any orphaned QUEUED/RUNNING audits (older than the stale window) to
   * CANCELLED so they don't linger as zombies. Returns the count healed.
   */
  private async healStaleAudits(tenantId: number): Promise<number> {
    const { count } = await this.prisma.shieldAudit.updateMany({
      where: {
        tenantId,
        status: { in: IN_PROGRESS_STATUSES },
        createdAt: { lt: new Date(Date.now() - STALE_AUDIT_TIMEOUT_MS) },
      },
      data: {
        status: ShieldAuditStatus.CANCELLED,
        completedAt: new Date(),
        errorMessage: 'Auto-healed: audit exceeded the in-progress timeout',
      },
    });
    if (count > 0) {
      this.logger.warn(`Auto-healed ${count} stale shield audit(s) for tenant ${tenantId}`);
    }
    return count;
  }

  /**
   * Cancel an in-progress audit. Idempotency: cancelling an already-terminal
   * audit is rejected (never clobbers a COMPLETED result — handles the
   * cancel-vs-finish race). Removes the queued BullMQ job so a not-yet-started
   * job won't run, and marks the System Activity Job cancelled.
   */
  async cancelAudit(tenantId: number, auditId: string) {
    const audit = await this.prisma.shieldAudit.findFirst({
      where: { id: auditId, tenantId },
      select: { id: true, status: true },
    });
    if (!audit) throw new NotFoundException('Audit not found');

    if (!IN_PROGRESS_STATUSES.includes(audit.status)) {
      throw new BadRequestException('This audit has already finished');
    }

    await this.prisma.shieldAudit.update({
      where: { id: auditId },
      data: {
        status: ShieldAuditStatus.CANCELLED,
        completedAt: new Date(),
        errorMessage: 'Cancelled by user',
      },
    });

    // Best-effort: dequeue the BullMQ job and mark the System Activity Job
    // cancelled. The worker also re-checks status before running, so failures
    // here don't risk a resurrected audit.
    await this.cancelLinkedJob(tenantId, auditId);

    await this.cache.del(buildKey('sally:shield', 'results', tenantId));
    await this.cache.del(buildKey('sally:shield', 'score', tenantId));

    this.logger.log(`Shield audit cancelled: ${auditId} (tenant: ${tenantId})`);
    return { cancelled: true, auditId };
  }

  /** Remove the queued BullMQ job and cancel the System Activity Job row, if present. */
  private async cancelLinkedJob(tenantId: number, auditId: string) {
    const job = await this.prisma.job.findFirst({
      where: {
        tenantId,
        category: SHIELD_AUDIT_JOB.category,
        type: SHIELD_AUDIT_JOB.type,
        inputData: { path: ['auditId'], equals: auditId },
      },
      select: { id: true },
      orderBy: { id: 'desc' },
    });
    if (!job) return;

    try {
      const bullJob = await this.auditQueue.getJob(bullJobIdFromDbId('safety', job.id));
      // A job that's actively running can't be removed; the worker guard stops it.
      if (bullJob && !(await bullJob.isActive())) {
        await bullJob.remove();
      }
    } catch (err) {
      this.logger.warn(`Failed to remove queued shield audit job for ${auditId}: ${(err as Error).message}`);
    }

    await this.jobService.cancelJob(job.id);
  }

  async getAuditHistory(tenantId: number, limit = 20, offset = 0, dateFrom?: string, dateTo?: string) {
    const where: any = { tenantId };
    const dateFilter = buildDateRangeFilter(dateFrom, dateTo);
    if (dateFilter) where.createdAt = dateFilter;

    const [audits, total] = await Promise.all([
      this.prisma.shieldAudit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          scope: true,
          status: true,
          overallScore: true,
          hosScore: true,
          driversScore: true,
          vehiclesScore: true,
          loadsScore: true,
          statusLabel: true,
          triggeredBy: true,
          startedAt: true,
          completedAt: true,
          durationMs: true,
          createdAt: true,
          _count: { select: { findings: true } },
        },
      }),
      this.prisma.shieldAudit.count({ where }),
    ]);

    return { audits, total };
  }

  async getAuditById(tenantId: number, auditId: string) {
    return this.prisma.shieldAudit.findFirst({
      where: { id: auditId, tenantId },
      include: {
        findings: { orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }] },
        triggeredByUser: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async getFindings(
    tenantId: number,
    filters?: {
      category?: string;
      severity?: string;
      isResolved?: boolean;
    },
  ) {
    return this.prisma.shieldFinding.findMany({
      where: {
        tenantId,
        ...(filters?.category ? { category: filters.category as any } : {}),
        ...(filters?.severity ? { severity: filters.severity as any } : {}),
        ...(filters?.isResolved != null ? { isResolved: filters.isResolved } : {}),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async resolveFinding(tenantId: number, findingId: string, userId: number) {
    return this.prisma.shieldFinding.update({
      where: { id: findingId, tenantId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
    });
  }

  async disputeFinding(tenantId: number, findingId: string, userId: number, reason: string) {
    const finding = await this.prisma.shieldFinding.findFirst({
      where: { id: findingId, tenantId },
      select: { id: true, isResolved: true, isDisputed: true },
    });
    if (!finding) {
      throw new NotFoundException(`Shield finding ${findingId} not found`);
    }
    if (finding.isResolved) {
      throw new BadRequestException(`Cannot dispute a resolved finding. Reopen via the UI first.`);
    }
    if (finding.isDisputed) {
      throw new BadRequestException(`Finding is already under dispute`);
    }
    return this.prisma.shieldFinding.update({
      where: { id: findingId, tenantId },
      data: {
        isDisputed: true,
        disputedAt: new Date(),
        disputedById: userId,
        disputeReason: reason,
      },
    });
  }

  // Custom Rules
  async getCustomRules(tenantId: number) {
    return this.prisma.shieldCustomRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCustomRule(tenantId: number, rule: string, userId: number) {
    return this.prisma.shieldCustomRule.create({
      data: { tenantId, rule, createdBy: userId },
    });
  }

  async updateCustomRule(tenantId: number, ruleId: string, data: { rule?: string; isActive?: boolean }) {
    return this.prisma.shieldCustomRule.update({
      where: { id: ruleId, tenantId },
      data,
    });
  }

  async deleteCustomRule(tenantId: number, ruleId: string) {
    return this.prisma.shieldCustomRule.delete({
      where: { id: ruleId, tenantId },
    });
  }

  // Bulk resolve
  async bulkResolveFindings(tenantId: number, findingIds: string[], userId: number) {
    return this.prisma.shieldFinding.updateMany({
      where: { id: { in: findingIds }, tenantId },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById: userId,
      },
    });
  }

  getNextScheduledAuditTime(): Date {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(2, 0, 0, 0); // 2 AM UTC (matches cron: 0 2 * * *)
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  // PDF Export — structured by source (Rule Engine / AI Analysis / Custom Rules)
  async generateAuditPdf(tenantId: number, auditId: string): Promise<Buffer> {
    const audit = await this.prisma.shieldAudit.findFirst({
      where: { id: auditId, tenantId },
      include: {
        findings: { orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }] },
        tenant: { select: { companyName: true } },
      },
    });

    if (!audit) throw new NotFoundException('Shield audit not found');

    // Fetch custom rules for the evaluation list in Section 3
    const customRules = await this.prisma.shieldCustomRule.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    // pdfmake server-side: import Printer, use bundled Roboto TTF fonts
    const { default: PdfPrinter } = await import('pdfmake/js/Printer' as any);
    const path = await import('path');
    const fontsDir = path.join(path.dirname(require.resolve('pdfmake/package.json')), 'build/fonts/Roboto');
    const printer = new PdfPrinter({
      Roboto: {
        normal: path.join(fontsDir, 'Roboto-Regular.ttf'),
        bold: path.join(fontsDir, 'Roboto-Medium.ttf'),
        italics: path.join(fontsDir, 'Roboto-Italic.ttf'),
        bolditalics: path.join(fontsDir, 'Roboto-MediumItalic.ttf'),
      },
    });

    const severityOrder: Record<string, number> = {
      CRITICAL: 0,
      WARNING: 1,
      INFO: 2,
      PASSED: 3,
    };

    const allFindings = [...(audit.findings || [])].sort(
      (a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99),
    );

    // Partition findings by source
    const ruleFindings = allFindings.filter((f) => f.source === 'RULE' || !f.source);
    const aiFindings = allFindings.filter((f) => f.source === 'AI');
    const customFindings = allFindings.filter((f) => f.source === 'CUSTOM');

    // Helper: build a findings table for a section
    const buildFindingsTable = (findings: typeof allFindings): Record<string, unknown> => {
      if (findings.length === 0) {
        return {
          text: 'No findings in this section.',
          italics: true,
          margin: [0, 5, 0, 10],
        };
      }
      return {
        table: {
          headerRows: 1,
          widths: ['auto', 'auto', '*', '*'],
          body: [
            ['Severity', 'Category', 'Finding', 'Recommendation'],
            ...findings.map((f) => [
              { text: f.severity, bold: f.severity === 'CRITICAL' },
              f.category,
              f.title,
              f.recommendation || '-',
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        margin: [0, 5, 0, 10],
      };
    };

    // Build custom rules evaluation section
    const skippedRules = (audit.aiSkippedRules as any[]) || [];
    const skippedRuleTexts = new Set(skippedRules.map((s: any) => s.rule));
    const matchedRuleTexts = new Set(
      customFindings.map((f) => (f.metadata as Record<string, unknown> | null)?.sourceRule).filter(Boolean),
    );

    const customRulesEvaluation: any[] = [];
    for (const rule of customRules) {
      if (matchedRuleTexts.has(rule.rule)) {
        const finding = customFindings.find(
          (f) => (f.metadata as Record<string, unknown> | null)?.sourceRule === rule.rule,
        );
        customRulesEvaluation.push({
          text: [
            { text: 'MATCHED', bold: true, color: '#cc0000' },
            ` — "${rule.rule}"`,
            finding ? `\n  → ${finding.title}` : '',
          ],
          margin: [0, 2, 0, 2],
        });
      } else if (skippedRuleTexts.has(rule.rule)) {
        const skip = skippedRules.find((s: any) => s.rule === rule.rule);
        customRulesEvaluation.push({
          text: [
            { text: 'SKIPPED', bold: true, color: '#999999' },
            ` — "${rule.rule}"`,
            skip ? `\n  → Reason: ${skip.reason}` : '',
          ],
          margin: [0, 2, 0, 2],
        });
      } else if (rule.isActive) {
        customRulesEvaluation.push({
          text: [{ text: 'COMPLIANT', bold: true, color: '#228B22' }, ` — "${rule.rule}"`],
          margin: [0, 2, 0, 2],
        });
      } else {
        customRulesEvaluation.push({
          text: [{ text: 'INACTIVE', bold: true, color: '#999999' }, ` — "${rule.rule}"`],
          margin: [0, 2, 0, 2],
        });
      }
    }

    const periodDays = audit.auditPeriodDays ?? 30;

    const docDefinition = {
      defaultStyle: { font: 'Roboto', fontSize: 9 },
      content: [
        // Header
        {
          text: `${(audit as any).tenant?.companyName || 'Fleet'} — Shield Compliance Report`,
          style: 'header',
        },
        {
          text: [
            `Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
            `  |  Audit Period: Last ${periodDays} days`,
          ],
          style: 'subheader',
        },
        { text: ' ' },

        // Score overview
        {
          columns: [
            {
              text: `Overall Score: ${audit.overallScore ?? 'N/A'}/100`,
              style: 'score',
            },
            {
              text: `Status: ${audit.statusLabel || 'N/A'}`,
              style: 'score',
            },
          ],
        },
        { text: ' ' },
        {
          columns: [
            { text: `HOS: ${audit.hosScore ?? '-'}/100` },
            { text: `Drivers: ${audit.driversScore ?? '-'}/100` },
            { text: `Vehicles: ${audit.vehiclesScore ?? '-'}/100` },
            { text: `Loads: ${audit.loadsScore ?? '-'}/100` },
          ],
        },
        { text: ' ' },

        // Section 1: Rule Engine Findings
        {
          text: `Section 1: Rule Engine Findings (${ruleFindings.length})`,
          style: 'sectionHeader',
        },
        buildFindingsTable(ruleFindings),

        // Section 2: AI Compliance Analysis
        {
          text: `Section 2: AI Compliance Analysis (${aiFindings.length})`,
          style: 'sectionHeader',
        },
        ...(audit.aiSummary ? [{ text: audit.aiSummary, margin: [0, 5, 0, 5] as const }] : []),
        ...(Array.isArray(audit.aiActions) && audit.aiActions.length > 0
          ? [
              {
                text: 'Priority Actions:',
                bold: true,
                margin: [0, 5, 0, 3] as const,
              },
              {
                ul: (audit.aiActions as any[]).map((a: any) => a.action),
                margin: [0, 0, 0, 10] as const,
              },
            ]
          : []),
        buildFindingsTable(aiFindings),

        // Section 3: Custom Rules Evaluation
        {
          text: `Section 3: Custom Rules Evaluation (${customRules.length} rules)`,
          style: 'sectionHeader',
        },
        ...(customRules.length === 0
          ? [
              {
                text: 'No custom rules configured.',
                italics: true,
                margin: [0, 5, 0, 10] as const,
              },
            ]
          : customRulesEvaluation),
        { text: ' ' },

        // Footer
        {
          text: 'Generated by SALLY Shield',
          style: 'footer',
          alignment: 'center' as const,
        },
      ],
      styles: {
        header: { fontSize: 18, bold: true, margin: [0, 0, 0, 5] },
        subheader: { fontSize: 10, color: '#666666' },
        score: { fontSize: 14, bold: true },
        sectionHeader: { fontSize: 12, bold: true, margin: [0, 10, 0, 5] },
        footer: { fontSize: 8, color: '#999999', margin: [0, 20, 0, 0] },
      },
    };

    const doc = await printer.createPdfKitDocument(docDefinition as any);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });
  }
}
