import { Injectable, Logger, Inject, forwardRef, InternalServerErrorException } from '@nestjs/common';
import { AiSurface, AiInvocationStatus } from '@prisma/client';
import { AlertStatusSchema } from '@sally/shared-types';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { AlertCacheService } from './alert-cache.service';
import { PromptingService, PROMPT_NAMES } from '../../../../domains/prompting';
import { MastraProvider } from '../../../../domains/ai/sally-ai/mastra/mastra.provider';
import { AiTelemetryService } from '../../../../domains/ai/infrastructure/telemetry/ai-telemetry.service';
import { MODEL_ID_BY_ALIAS, PROVIDER_BY_ALIAS } from '../../../../domains/ai/infrastructure/providers/ai-provider';
import { CACHE_TTL_WARM_5M } from '../../../../constants/cache.constants';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';

// sally-alert-briefing is registered with ai('fast') in mastra.provider.ts.
const ALERT_BRIEFING_MODEL_ALIAS = 'fast' as const;

const ALERT_STATUS = AlertStatusSchema.enum;

export interface AlertBriefing {
  situations: {
    severity: 'critical' | 'high' | 'medium';
    title: string;
    summary: string;
    recommendation: string;
    relatedAlertIds: string[];
    driverIds: string[];
    loadIds: string[];
  }[];
  overallStatus: string;
  generatedAt: string;
}

@Injectable()
export class AlertBriefingService {
  private readonly logger = new Logger(AlertBriefingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: AlertCacheService,
    @Inject(forwardRef(() => PromptingService))
    private readonly promptService: PromptingService,
    private readonly mastraProvider: MastraProvider,
    private readonly aiTelemetry: AiTelemetryService,
  ) {}

  async getCached(tenantId: number): Promise<AlertBriefing | null> {
    const cacheKey = buildKey('sally:alerts', 'briefing', tenantId);
    return this.cache.get<AlertBriefing>(cacheKey);
  }

  async generate(tenantId: number, force: boolean = false): Promise<AlertBriefing> {
    const cacheKey = buildKey('sally:alerts', 'briefing', tenantId);

    if (!force) {
      const cached = await this.cache.get<AlertBriefing>(cacheKey);
      if (cached) return cached;
    }

    // 1. Fetch active alerts
    const activeAlerts = await this.prisma.alert.findMany({
      where: {
        tenantId,
        status: { in: [ALERT_STATUS.ACTIVE, ALERT_STATUS.ACKNOWLEDGED] },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });

    // 2. Fetch 24h history
    const oneDayAgo = new Date(Date.now() - 24 * 3600000);
    const recentHistory = await this.prisma.alert.findMany({
      where: {
        tenantId,
        status: { in: [ALERT_STATUS.RESOLVED, ALERT_STATUS.AUTO_RESOLVED] },
        resolvedAt: { gte: oneDayAgo },
      },
      orderBy: { resolvedAt: 'desc' },
      take: 100,
    });

    // 3. Count drivers and loads
    const [driverCount, loadCount] = await Promise.all([
      this.prisma.driver.count({
        where: { tenantId, status: { not: 'INACTIVE' } },
      }),
      this.prisma.load.count({
        where: { tenantId, status: { in: ['ASSIGNED', 'IN_TRANSIT'] } },
      }),
    ]);

    // 4. Build prompt
    const activeAlertsText =
      activeAlerts.length > 0
        ? activeAlerts
            .map(
              (a) =>
                `[${a.alertId}] ${a.alertType} (${a.priority}) — ${a.title}: ${a.message} | Driver: ${a.driverId}${a.loadId ? ` | Load: ${a.loadId}` : ''} | Occurrences: ${a.occurrenceCount}`,
            )
            .join('\n')
        : 'No active alerts.';

    const historyText =
      recentHistory.length > 0
        ? recentHistory
            .map(
              (a) =>
                `[${a.alertId}] ${a.alertType} (${a.status}) — ${a.title} | Driver: ${a.driverId} | Occurrences: ${a.occurrenceCount}`,
            )
            .join('\n')
        : 'No recent history.';

    const systemPrompt = await this.promptService.getPrompt(PROMPT_NAMES.ALERT_BRIEFING, {
      activeAlerts: activeAlertsText,
      recentHistory: historyText,
      driverCount: String(driverCount),
      loadCount: String(loadCount),
    });

    // 5. Call LLM via Mastra agent
    try {
      const agent = this.mastraProvider.getMastra().getAgent('sally-alert-briefing');
      const startedAt = Date.now();
      const result = await agent.generate(
        [
          {
            role: 'user' as const,
            content: `${systemPrompt}\n\nGenerate the alert intelligence briefing now. Return only valid JSON.`,
          },
        ],
        {},
      );

      // Record cost telemetry. Failures never block the briefing — the
      // recorder catches internally.
      void this.recordTelemetry(tenantId, result, Date.now() - startedAt);

      // Parse response
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new InternalServerErrorException('Failed to generate briefing — AI response was not valid JSON');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      const briefing: AlertBriefing = {
        situations: (parsed.situations || []).map((s: any) => ({
          severity: s.severity || 'medium',
          title: s.title || '',
          summary: s.summary || '',
          recommendation: s.recommendation || '',
          relatedAlertIds: s.relatedAlertIds || [],
          driverIds: s.driverIds || [],
          loadIds: s.loadIds || [],
        })),
        overallStatus: parsed.overallStatus || 'Briefing generated.',
        generatedAt: new Date().toISOString(),
      };

      // 6. Cache
      await this.cache.set(cacheKey, briefing, CACHE_TTL_WARM_5M);

      this.logger.log(`Generated alert briefing for tenant ${tenantId}: ${briefing.situations.length} situations`);

      return briefing;
    } catch (error: any) {
      this.logger.error(`Alert briefing generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Record AI cost telemetry for a Mastra agent.generate() call. Token
   * counts come from `result.usage`, which Mastra v1.4 surfaces directly
   * but with a generic `LanguageModelUsage` shape (provider-dependent
   * keys). We read keys defensively and fall back to zero.
   *
   * Failures in telemetry never block the underlying briefing.
   */
  private async recordTelemetry(tenantId: number, result: unknown, latencyMs: number): Promise<void> {
    try {
      const usage = (result as { usage?: Record<string, unknown> } | null)?.usage ?? {};
      const promptTokens = numberOrZero(usage.promptTokens ?? usage.inputTokens);
      const completionTokens = numberOrZero(usage.completionTokens ?? usage.outputTokens);
      const cachedTokens = optionalNumber(
        usage.cachedPromptTokens ?? usage.cacheReadInputTokens ?? usage.promptTokensCached,
      );

      await this.aiTelemetry.record(
        {
          provider: PROVIDER_BY_ALIAS[ALERT_BRIEFING_MODEL_ALIAS],
          model: MODEL_ID_BY_ALIAS[ALERT_BRIEFING_MODEL_ALIAS],
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          cachedTokens,
          latencyMs,
          status: AiInvocationStatus.OK,
        },
        {
          tenantId,
          surface: AiSurface.ALERT_BRIEFING,
          agentId: 'sally-alert-briefing',
        },
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Alert briefing telemetry failed (non-blocking): ${msg}`);
    }
  }
}

function numberOrZero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function optionalNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
