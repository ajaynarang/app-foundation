import { Injectable, Logger } from '@nestjs/common';
import { ContentModerationService } from './content-moderation.service';
import { GuardrailsService } from './guardrails.service';
import { AiRouteResolver } from '../routing/ai-route-resolver.service';
import type { ModerationDirection, ModerationResult, GuardrailEvent } from './types';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly contentModeration: ContentModerationService,
    private readonly guardrails: GuardrailsService,
    private readonly aiRouteResolver: AiRouteResolver,
  ) {}

  /**
   * Redact PII from text for audit logging purposes.
   * Returns the redacted text (or original if no PII found / on error).
   */
  async redactForAudit(text: string): Promise<string> {
    try {
      const result = await this.guardrails.redactPii(text);
      return result.text;
    } catch (error) {
      this.logger.warn('PII redaction for audit failed — using original text', error);
      return text;
    }
  }

  /**
   * `tenantId` is the workspace the text belongs to. Input moderation sends text to an external provider, so it is
   * skipped for a workspace that requires zero data retention; the local guardrails still run. Output moderation is
   * local only.
   */
  async moderate(
    text: string,
    direction: ModerationDirection,
    persona: string,
    tenantId?: number,
  ): Promise<ModerationResult> {
    if (direction === 'input') {
      return this.moderateInput(text, persona, tenantId);
    }
    return this.moderateOutput(text);
  }

  private async moderateInput(text: string, persona: string, tenantId?: number): Promise<ModerationResult> {
    const events: GuardrailEvent[] = [];

    // Layer 1: OpenAI content moderation (toxicity, hate, etc.). An EXTERNAL, standard-retention endpoint, so it is
    // skipped for a zero-retention workspace: no tenant text reaches a retaining provider. Runs first otherwise and
    // blocks immediately if flagged (fast, ~300ms).
    const externalAllowed = tenantId === undefined || !(await this.aiRouteResolver.isZeroRetention(tenantId));
    if (externalAllowed) {
      const contentResult = await this.contentModeration.check(text);
      events.push({
        guard: 'content-moderation',
        result: contentResult.flagged ? 'block' : 'pass',
        categories: contentResult.categories,
      });
      if (contentResult.flagged) {
        return { blocked: true, events };
      }
    } else {
      this.logger.debug('Skipping external content moderation for a zero-retention workspace');
    }

    // Layer 2: hai-guardrails — run injection, secrets, PII in parallel
    const [injectionResult, secretResult, piiResult] = await Promise.all([
      this.guardrails.checkInjection(text),
      this.guardrails.checkSecrets(text),
      this.guardrails.checkPii(text),
    ]);

    events.push({
      guard: 'injection',
      result: injectionResult.flagged ? 'block' : 'pass',
      score: injectionResult.score,
    });
    if (injectionResult.flagged) {
      return { blocked: true, events };
    }

    events.push({
      guard: 'secret',
      result: secretResult.flagged ? 'block' : 'pass',
    });
    if (secretResult.flagged) {
      return { blocked: true, events };
    }

    const piiAction: 'pass' | 'flag' = piiResult.detected ? 'flag' : 'pass';
    events.push({
      guard: 'pii',
      result: piiAction,
    });

    return { blocked: false, events };
  }

  private async moderateOutput(text: string): Promise<ModerationResult> {
    const events: GuardrailEvent[] = [];

    // Check for system prompt leakage
    const leakageResult = await this.guardrails.checkLeakage(text);
    events.push({
      guard: 'leakage',
      result: leakageResult.flagged ? 'flag' : 'pass',
      score: leakageResult.score,
    });

    // Redact PII before DB persistence
    const piiResult = await this.guardrails.redactPii(text);
    events.push({
      guard: 'pii-redaction',
      result: piiResult.redacted ? 'flag' : 'pass',
    });

    return {
      blocked: false,
      events,
      redactedText: piiResult.text,
    };
  }
}
