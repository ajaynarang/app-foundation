import { Injectable, Logger } from '@nestjs/common';
import type { GuardrailsEngineResult } from '@presidio-dev/hai-guardrails';
import { SyncRedactor } from 'redact-pii';
import type { GuardCheckResult, PiiCheckResult, PiiRedactResult } from './types';

// Loaded lazily via dynamic import to handle the ESM-only package in a CJS NestJS context
type GuardrailsEngine = InstanceType<typeof import('@presidio-dev/hai-guardrails').GuardrailsEngine>;

@Injectable()
export class GuardrailsService {
  private readonly logger = new Logger(GuardrailsService.name);
  private readonly redactor: InstanceType<typeof SyncRedactor>;
  private injectionEngine: GuardrailsEngine | null = null;
  private secretEngine: GuardrailsEngine | null = null;
  private piiEngine: GuardrailsEngine | null = null;
  private leakageEngine: GuardrailsEngine | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.redactor = new SyncRedactor();
    this.initPromise = this.initEngines();
  }

  private async initEngines(): Promise<void> {
    try {
      const { GuardrailsEngine, injectionGuard, secretGuard, piiGuard, leakageGuard, SelectionType } =
        await import('@presidio-dev/hai-guardrails');

      this.injectionEngine = new GuardrailsEngine({
        guards: [
          injectionGuard({ roles: ['user'], selection: SelectionType.Last }, { mode: 'heuristic', threshold: 0.7 }),
        ],
      });
      this.secretEngine = new GuardrailsEngine({
        guards: [secretGuard({ roles: ['user'], selection: SelectionType.Last })],
      });
      this.piiEngine = new GuardrailsEngine({
        guards: [
          piiGuard({
            roles: ['user'],
            selection: SelectionType.Last,
            mode: 'redact',
          }),
        ],
      });
      this.leakageEngine = new GuardrailsEngine({
        guards: [
          leakageGuard({ roles: ['assistant'], selection: SelectionType.Last }, { mode: 'heuristic', threshold: 0.7 }),
        ],
      });
    } catch (error) {
      this.logger.warn('Failed to initialize guardrails engines — all checks will fail open', error);
    }
  }

  private async ensureInit(): Promise<void> {
    if (this.initPromise !== null) await this.initPromise;
  }

  async checkInjection(text: string): Promise<GuardCheckResult> {
    await this.ensureInit();
    try {
      if (!this.injectionEngine) return { flagged: false };
      const result = await this.injectionEngine.run([{ role: 'user', content: text }]);
      return this.extractGuardResult(result);
    } catch (error) {
      this.logger.error('Injection guard failed — failing open', error);
      return { flagged: false };
    }
  }

  async checkSecrets(text: string): Promise<GuardCheckResult> {
    await this.ensureInit();
    try {
      if (!this.secretEngine) return { flagged: false };
      const result = await this.secretEngine.run([{ role: 'user', content: text }]);
      return this.extractGuardResult(result);
    } catch (error) {
      this.logger.error('Secret guard failed — failing open', error);
      return { flagged: false };
    }
  }

  async checkPii(text: string): Promise<PiiCheckResult> {
    await this.ensureInit();
    try {
      if (!this.piiEngine) return { detected: false };
      const result = await this.piiEngine.run([{ role: 'user', content: text }]);
      const guardResults = result.messagesWithGuardResult[0]?.messages ?? [];
      const anyFailed = guardResults.some((r) => !r.passed);
      return { detected: anyFailed };
    } catch (error) {
      this.logger.error('PII guard failed — failing open', error);
      return { detected: false };
    }
  }

  async checkLeakage(text: string): Promise<GuardCheckResult> {
    await this.ensureInit();
    try {
      if (!this.leakageEngine) return { flagged: false };
      const result = await this.leakageEngine.run([{ role: 'assistant', content: text }]);
      return this.extractGuardResult(result);
    } catch (error) {
      this.logger.error('Leakage guard failed — failing open', error);
      return { flagged: false };
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- async API for consistency with other guard methods
  async redactPii(text: string): Promise<PiiRedactResult> {
    try {
      const redacted = this.redactor.redact(text);
      const wasRedacted = redacted !== text;
      return { text: redacted, redacted: wasRedacted };
    } catch (error) {
      this.logger.error('PII redaction failed — returning original', error);
      return { text, redacted: false };
    }
  }

  private extractGuardResult(result: GuardrailsEngineResult): GuardCheckResult {
    const guardResults = result.messagesWithGuardResult[0]?.messages ?? [];
    const anyFailed = guardResults.some((r) => !r.passed);
    const failedResult = guardResults.find((r) => !r.passed);

    return {
      flagged: anyFailed,
      score: (failedResult?.additionalFields?.score as number) ?? undefined,
      details: failedResult?.reason,
    };
  }
}
