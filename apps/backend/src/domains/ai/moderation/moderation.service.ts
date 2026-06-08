import { Injectable, Logger } from '@nestjs/common';
import { ContentModerationService } from './content-moderation.service';
import { GuardrailsService } from './guardrails.service';
import type { ModerationDirection, ModerationResult, GuardrailEvent } from './types';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly contentModeration: ContentModerationService,
    private readonly guardrails: GuardrailsService,
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

  async moderate(text: string, direction: ModerationDirection, persona: string): Promise<ModerationResult> {
    if (direction === 'input') {
      return this.moderateInput(text, persona);
    }
    return this.moderateOutput(text);
  }

  private async moderateInput(text: string, persona: string): Promise<ModerationResult> {
    const events: GuardrailEvent[] = [];

    // Layer 1: OpenAI content moderation (toxicity, hate, etc.)
    // Runs first — blocks immediately if flagged (fast, ~300ms)
    const contentResult = await this.contentModeration.check(text);
    events.push({
      guard: 'content-moderation',
      result: contentResult.flagged ? 'block' : 'pass',
      categories: contentResult.categories,
    });
    if (contentResult.flagged) {
      return { blocked: true, events };
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

    let piiAction: 'pass' | 'flag';
    if (persona === 'prospect') {
      piiAction = 'pass';
    } else {
      piiAction = piiResult.detected ? 'flag' : 'pass';
    }
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
