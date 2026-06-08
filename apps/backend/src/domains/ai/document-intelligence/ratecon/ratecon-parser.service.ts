import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { AiSurface } from '@prisma/client';
import type { ModelAlias } from '@sally/shared-types';
import { isAiConfigured, getRequiredAiEnvVar, ai, aiDirect } from '../../infrastructure/providers/ai-provider';
import { StructuredOutputService } from '../../infrastructure/providers/structured-output.service';
import { AI_LINK_REF_TYPES } from '../../infrastructure/telemetry/ai-telemetry.constants';
import { buildIdempotencyKey } from '../../infrastructure/telemetry/idempotency';
import { PromptingService, PROMPT_NAMES } from '../../../../domains/prompting';
import { RATECON_AGENT_INSTRUCTIONS } from '../../../../domains/prompting/prompts/fallbacks/ratecon-parser.fallback';
import { RateconExtractionSchema, computeConfidence, type ParseResult, type RateconData } from './ratecon.schema';
import { detectScrambledLayout } from './ratecon-layout-detector';
import { normalizeStopLocations } from './ratecon-stop-normalizer';
import { PDFParse } from 'pdf-parse';

const DEFAULT_MIN_TEXT_LENGTH = 50;

// SQ-107 — per-page detector. The 50-char total-length gate (kept as
// `minTextLength` for the env override + corrupt-PDF fallback) is unreliable:
// pdf-parse can emit page-marker boilerplate that exceeds it while the actual
// document content is zero (image-only scanned PDFs). We classify a PDF as
// scanned iff NO page contains MIN_WORDS_PER_PAGE alphanumeric word tokens.
const MIN_WORDS_PER_PAGE = 10;
const PAGE_MARKER_RE = /--\s*\d+\s*of\s*\d+\s*--|\f/g;
const ALPHA_WORD_RE = /\b[A-Za-z]{3,}\b/g;

interface PdfTextResult {
  text: string;
  numpages?: number;
  pages?: Array<{ text?: string; num?: number } | string>;
}

/**
 * Cost-attribution context threaded from the processor.
 *
 * `attemptId` discriminates the idempotency key: a BullMQ retry of the SAME
 * job reuses the same attemptId (so the retried model call collapses to one
 * billed row), but a user-initiated reprocess (`forceReparse`) arrives as a
 * NEW document job with a NEW attemptId — that's a real second API call and
 * MUST be billed separately. Without it, reprocessing identical PDF bytes
 * would dedupe on content+linkRef and silently hide the second cost,
 * under-reporting the budget.
 */
export interface RateconAiContext {
  tenantId: number;
  linkRefId?: string;
  attemptId?: string;
}

function countAlphaWords(text: string): number {
  const cleaned = text.replace(PAGE_MARKER_RE, '');
  return (cleaned.match(ALPHA_WORD_RE) ?? []).length;
}

function getPageTexts(pdfData: PdfTextResult): string[] {
  if (Array.isArray(pdfData.pages) && pdfData.pages.length > 0) {
    return pdfData.pages.map((p) => (typeof p === 'string' ? p : (p?.text ?? '')));
  }
  // No per-page array — fall back to splitting the combined text on form-feed
  // (pdf.js page boundary) so the per-page heuristic still has something to
  // measure rather than collapsing to "1 giant page".
  return (pdfData.text ?? '').split('\f');
}

export function detectScannedPdf(pdfData: PdfTextResult): { isScanned: boolean; pageWordCounts: number[] } {
  const pageTexts = getPageTexts(pdfData);
  const pageWordCounts = pageTexts.map(countAlphaWords);
  const isScanned = pageWordCounts.every((n) => n < MIN_WORDS_PER_PAGE);
  return { isScanned, pageWordCounts };
}

// SQ-107 — sentinel guard. A vision model that can't read a field will often
// satisfy the Zod schema by inventing a placeholder (`<UNKNOWN>`, `UNKNOWN`,
// `N/A`, etc.). Without this guard the downstream processor cheerfully writes
// the placeholder into `Load.referenceNumber` / `Load.customerName` and the
// dispatcher sees a stub draft. We reject sentinels post-parse so the
// existing fallback chain retries with the powerful model; if both fail, the
// caller's catch path emits RATECON_FAILED and no draft is created.
//
// We compare exact strings (case-insensitive, trimmed). Legitimate values that
// contain "unknown" as a substring (e.g. "Unknown Lane Routing Inc") pass.
const SENTINEL_VALUES = new Set([
  '',
  '<unknown>',
  'unknown',
  '__unreadable__',
  '<not_found>',
  'not_found',
  'n/a',
  'na',
  'null',
  'none',
]);

export function isExtractionSentinel(value: string | undefined | null): boolean {
  if (value == null) return true;
  const normalized = value.trim().toLowerCase();
  if (SENTINEL_VALUES.has(normalized)) return true;
  // Catch any bracketed placeholder like "<FOO>" or "[FOO]" — the model
  // signals uncertainty with angle/square brackets even when the inner token
  // varies.
  if (/^[<\[].*[>\]]$/.test(normalized)) return true;
  return false;
}

function assertExtractionReadable(extraction: { load_number?: string; broker_name?: string }, fileName: string): void {
  if (isExtractionSentinel(extraction.load_number)) {
    throw new Error(`extraction returned sentinel value for load_number ("${extraction.load_number}") in ${fileName}`);
  }
  if (isExtractionSentinel(extraction.broker_name)) {
    throw new Error(`extraction returned sentinel value for broker_name ("${extraction.broker_name}") in ${fileName}`);
  }
}

// ── Configurable model & fallback via environment ───────────────────
// RATECON_AI_PROVIDER: 'anthropic' (default, direct SDK) or 'gateway' (Vercel AI Gateway)
//   Gateway has timeout issues with large structured output schemas — use direct as default.
// RATECON_MODEL: which model alias to use ('standard' | 'powerful' | 'fast')
// RATECON_FALLBACK_ENABLED: if 'true', try the fallback model on failure
// RATECON_FALLBACK_MODEL: which model to fall back to (default: 'powerful')
// RATECON_TIMEOUT_MS: timeout for the primary model (default: 60000)
// RATECON_FALLBACK_TIMEOUT_MS: timeout for the fallback model (default: 120000)
// RATECON_MIN_TEXT_LENGTH: chars below which text-first auto-escalates to vision (default: 50)
// ModelAlias imported from @sally/shared-types above

function getRateconConfig() {
  const provider = (process.env.RATECON_AI_PROVIDER || 'anthropic') as 'anthropic' | 'gateway';
  const modelAlias = (process.env.RATECON_MODEL || 'standard') as ModelAlias;
  const fallbackEnabled = process.env.RATECON_FALLBACK_ENABLED === 'true';
  const fallbackModelAlias = (process.env.RATECON_FALLBACK_MODEL || 'powerful') as ModelAlias;
  const timeoutMs = parseInt(process.env.RATECON_TIMEOUT_MS || '90000', 10);
  const fallbackTimeoutMs = parseInt(process.env.RATECON_FALLBACK_TIMEOUT_MS || '120000', 10);

  // Resolve actual model instances based on provider choice
  const getModel = provider === 'anthropic' ? (alias: ModelAlias) => aiDirect(alias) : (alias: ModelAlias) => ai(alias);

  const minTextLength = parseInt(process.env.RATECON_MIN_TEXT_LENGTH || String(DEFAULT_MIN_TEXT_LENGTH), 10);

  return {
    provider,
    modelAlias,
    fallbackEnabled,
    fallbackModelAlias,
    timeoutMs,
    fallbackTimeoutMs,
    minTextLength,
    getModel,
  };
}

@Injectable()
export class RateconParserService {
  private readonly logger = new Logger(RateconParserService.name);

  constructor(
    private readonly structuredOutputService: StructuredOutputService,
    private readonly promptService: PromptingService,
  ) {}

  private async getExtractionPrompt(): Promise<string> {
    return this.promptService.getPrompt(PROMPT_NAMES.RATECON_PARSER);
  }

  /**
   * Shared post-extraction pipeline for every model/strategy attempt:
   *   1. Zod-validate the raw model output.
   *   2. SQ-112 — backfill stop city/state/zip from a combined location line
   *      (`Fair Lawn, NJ US 07410`) the conservative prompt left unsplit.
   *   3. SQ-107 — reject sentinel placeholders in required fields.
   *   4. Compute deterministic confidence.
   *
   * Order matters: normalize BEFORE the readability assertion so a stop whose
   * city/state were only recoverable from a combined line is counted as read.
   */
  private finalizeExtraction(rawObject: unknown, fileName: string): RateconData {
    const extraction = RateconExtractionSchema.parse(rawObject);

    const { stops, backfilledCount } = normalizeStopLocations(extraction.stops);
    if (backfilledCount > 0) {
      extraction.stops = stops;
      this.logger.log(
        `SQ-112 normalizer backfilled city/state/zip for ${backfilledCount} stop(s) in ${fileName}. ` +
          'metric:ratecon.stop_location_backfill',
      );
    }

    assertExtractionReadable(extraction, fileName);
    const confidence = computeConfidence(extraction);
    return { ...extraction, confidence };
  }

  async parse(
    fileBuffer: Buffer,
    fileName: string,
    requestedStrategy: 'text-first' | 'vision' = 'text-first',
    aiContext?: RateconAiContext,
  ): Promise<ParseResult> {
    if (!isAiConfigured()) {
      this.logger.error(`${getRequiredAiEnvVar()} is not configured`);
      throw new InternalServerErrorException(
        `AI service is not configured. Please set ${getRequiredAiEnvVar()} in environment variables.`,
      );
    }

    this.logger.log(`Parsing ratecon PDF: ${fileName} (${fileBuffer.length} bytes, strategy: ${requestedStrategy})`);

    if (requestedStrategy === 'vision') {
      return this.parseWithVision(fileBuffer, fileName, aiContext);
    }

    return this.parseWithTextFirst(fileBuffer, fileName, aiContext);
  }

  /**
   * Escalate a text-first attempt to the vision strategy and stamp the result
   * so it still reports as a text-first request that fell back. Shared by every
   * pre-model text-first bailout (scanned/short text, scrambled layout) so the
   * vision call — and its aiContext cost attribution — stays consistent.
   */
  private async escalateToVision(
    fileBuffer: Buffer,
    fileName: string,
    aiContext: RateconAiContext | undefined,
    fallbackReason: NonNullable<ParseResult['parsing']['fallbackReason']>,
    textExtractionChars: number,
  ): Promise<ParseResult> {
    const visionResult = await this.parseWithVision(fileBuffer, fileName, aiContext);
    return {
      ...visionResult,
      parsing: {
        ...visionResult.parsing,
        requestedStrategy: 'text-first',
        fallbackUsed: true,
        fallbackReason,
        textExtractionChars,
      },
    };
  }

  /**
   * Text-first strategy: extract PDF text, send to LLM with structuredOutput.
   * Model and fallback behavior are configurable via env vars:
   *   RATECON_MODEL (default: 'standard'), RATECON_FALLBACK_ENABLED (default: 'false'),
   *   RATECON_TIMEOUT_MS (default: 60000), RATECON_FALLBACK_TIMEOUT_MS (default: 120000)
   */
  private async parseWithTextFirst(
    fileBuffer: Buffer,
    fileName: string,
    aiContext?: RateconAiContext,
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const config = getRateconConfig();

    // Step 1: Extract text from PDF.
    // If the PDF is scanned/image-only, pdf-parse returns near-zero useful text
    // (often just page markers). In that case auto-escalate to the vision
    // strategy instead of failing — vision works on the raw PDF bytes and
    // does not require an OCR text layer.
    //
    // Cost guard: before paying for a vision call, reject zero-page / corrupt
    // PDFs outright — vision can't recover from a structurally broken file.
    let pdfText = '';
    let numPages = 0;
    let scanDetection: { isScanned: boolean; pageWordCounts: number[] } = {
      isScanned: true,
      pageWordCounts: [],
    };
    let textExtractionError: string | null = null;
    try {
      const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
      const pdfData = (await parser.getText()) as PdfTextResult;
      pdfText = pdfData.text ?? '';
      numPages = pdfData.numpages ?? (Array.isArray(pdfData.pages) ? pdfData.pages.length : 0);
      scanDetection = detectScannedPdf(pdfData);
    } catch (error) {
      textExtractionError = (error as Error).message;
      this.logger.warn(`Text extraction threw for ${fileName}: ${textExtractionError}`);
    }

    // Corrupt / structurally-broken PDFs: refuse before paying for vision.
    if (numPages === 0 && pdfText.length < config.minTextLength) {
      this.logger.error(
        `Text-first: ${fileName} has 0 pages (text=${pdfText.length} chars` +
          (textExtractionError ? `, parse error "${textExtractionError}"` : '') +
          ') — refusing to escalate to vision (corrupt/empty PDF)',
      );
      throw new BadRequestException(
        `Failed to read rate confirmation PDF "${fileName}". The file appears to be empty or corrupt.`,
      );
    }

    // Manual env override (RATECON_MIN_TEXT_LENGTH) lets staging force a higher bar
    // independent of the per-page detector — useful when downstream extractors
    // have known sensitivity to sparse text. The detector handles the SQ-107
    // boilerplate-only case; the threshold handles "real text but not enough".
    const charsBelowThreshold = pdfText.length < config.minTextLength;
    if (scanDetection.isScanned || charsBelowThreshold) {
      const reason = scanDetection.isScanned ? 'scanned (no real text on any page)' : 'below char threshold';
      this.logger.warn(
        `Text-first: ${reason} for ${fileName} (text=${pdfText.length} chars, pages=${numPages}, ` +
          `word-counts=[${scanDetection.pageWordCounts.join(',')}])` +
          (textExtractionError ? ` after parse error "${textExtractionError}"` : '') +
          ' — auto-escalating to vision strategy. metric:ratecon.text_to_vision_escalation',
      );
      return this.escalateToVision(fileBuffer, fileName, aiContext, 'text_extraction_too_short', pdfText.length);
    }

    // SQ-119 — scrambled-layout guard. Some broker forms linearize so the load
    // number's label ("PRO #") is severed from its value, leaving the extractor
    // to grab the carrier's MC# instead. Detect that here and escalate to vision,
    // where the spatial layout — and the label↔value binding — survives.
    const scramble = detectScrambledLayout(pdfText);
    if (scramble.isScrambled) {
      this.logger.warn(
        `Text-first: scrambled layout for ${fileName} ` +
          `(${scramble.loadLabelCount} load-number label(s), none bound to a value) ` +
          '— auto-escalating to vision strategy. metric:ratecon.scrambled_layout_escalation',
      );
      return this.escalateToVision(fileBuffer, fileName, aiContext, 'scrambled_layout', pdfText.length);
    }

    // Step 2: Build message
    const extractionPrompt = await this.getExtractionPrompt();
    const userMessage = `${extractionPrompt}\n\n---\nRATE CONFIRMATION DOCUMENT TEXT:\n---\n${pdfText}`;
    const messages = [{ role: 'user' as const, content: userMessage }];

    // Stable content digest for idempotency — the extracted PDF text is the
    // same across transient retries of the same document, so the key collapses
    // duplicate ledger rows. Primary vs fallback get distinct keys (different
    // attemptKind) since they're legitimately separate model calls.
    const contentDigestInput = `text-first|${aiContext?.attemptId ?? 'na'}|${pdfText}`;

    // Attempt 1: Primary model
    let primaryInvocationId: string | undefined;
    try {
      this.logger.log(
        `Text-first: sending ${pdfText.length} chars to ${config.modelAlias} model for ${fileName} (timeout: ${config.timeoutMs}ms, fallback: ${config.fallbackEnabled})`,
      );
      const result = await this.structuredOutputService.extract({
        messages,
        schema: RateconExtractionSchema,
        modelAlias: config.modelAlias,
        model: config.getModel(config.modelAlias),
        systemPrompt: RATECON_AGENT_INSTRUCTIONS,
        timeoutMs: config.timeoutMs,
        enforceBudget: true,
        aiContext: aiContext
          ? {
              tenantId: aiContext.tenantId,
              surface: AiSurface.DOC_RATECON,
              agentId: 'ratecon-parser',
              linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
              linkRefId: aiContext.linkRefId,
              idempotencyKey: buildIdempotencyKey(
                {
                  surface: AiSurface.DOC_RATECON,
                  linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
                  linkRefId: aiContext.linkRefId,
                },
                'primary',
                contentDigestInput,
              ),
            }
          : undefined,
      });
      primaryInvocationId = result.aiInvocationId;

      if (result.object) {
        const parsed = this.finalizeExtraction(result.object, fileName);
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Text-first (${config.modelAlias}/${config.provider}) succeeded for ${fileName} in ${durationMs}ms — load: ${parsed.load_number}, rate: $${parsed.rate_total_usd}`,
        );
        return {
          data: parsed,
          parsing: {
            requestedStrategy: 'text-first',
            actualStrategy: 'text-first',
            fallbackUsed: false,
            fallbackReason: null,
            textExtractionChars: pdfText.length,
            model: config.modelAlias,
            durationMs,
          },
        };
      }

      this.logger.warn(`Text-first (${config.modelAlias}) structuredOutput returned no object for ${fileName}`);
    } catch (error) {
      this.logger.warn(`Text-first (${config.modelAlias}) failed for ${fileName}: ${(error as Error).message}`);
    }

    // If fallback is disabled, fail immediately
    if (!config.fallbackEnabled) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `Text-first failed for ${fileName} (${config.modelAlias}/${config.provider}, ${durationMs}ms). Fallback is disabled (set RATECON_FALLBACK_ENABLED=true to enable).`,
      );
      throw new BadRequestException(
        `Failed to parse rate confirmation PDF "${fileName}". The ${config.modelAlias} model could not extract data.`,
      );
    }

    // Attempt 2: Fallback model
    try {
      this.logger.log(
        `Text-first: falling back to ${config.fallbackModelAlias} model for ${fileName} (timeout: ${config.fallbackTimeoutMs}ms)`,
      );
      const result = await this.structuredOutputService.extract({
        messages,
        schema: RateconExtractionSchema,
        modelAlias: config.fallbackModelAlias,
        model: config.getModel(config.fallbackModelAlias),
        systemPrompt: RATECON_AGENT_INSTRUCTIONS,
        timeoutMs: config.fallbackTimeoutMs,
        enforceBudget: true,
        aiContext: aiContext
          ? {
              tenantId: aiContext.tenantId,
              surface: AiSurface.DOC_RATECON,
              agentId: 'ratecon-parser-fallback',
              linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
              linkRefId: aiContext.linkRefId,
              parentInvocationId: primaryInvocationId,
              idempotencyKey: buildIdempotencyKey(
                {
                  surface: AiSurface.DOC_RATECON,
                  linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
                  linkRefId: aiContext.linkRefId,
                },
                'fallback',
                contentDigestInput,
              ),
            }
          : undefined,
      });

      if (result.object) {
        const parsed = this.finalizeExtraction(result.object, fileName);
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Text-first (${config.fallbackModelAlias}/${config.provider}) succeeded for ${fileName} in ${durationMs}ms — load: ${parsed.load_number}, rate: $${parsed.rate_total_usd}`,
        );
        return {
          data: parsed,
          parsing: {
            requestedStrategy: 'text-first',
            actualStrategy: 'text-first',
            fallbackUsed: true,
            fallbackReason: 'standard_model_failed',
            textExtractionChars: pdfText.length,
            model: config.fallbackModelAlias,
            durationMs,
          },
        };
      }

      throw new InternalServerErrorException('Document parsing failed — please try again or upload a clearer document');
    } catch (error) {
      this.logger.error(`Text-first failed for ${fileName} on both models: ${(error as Error).message}`);
      throw this.classifyError(error, fileName);
    }
  }

  /**
   * Vision strategy: send raw PDF buffer as file content to LLM.
   * Model and fallback behavior are configurable via same env vars as text-first.
   * Only used when explicitly requested by user (e.g., scanned PDFs).
   */
  private async parseWithVision(
    fileBuffer: Buffer,
    fileName: string,
    aiContext?: RateconAiContext,
  ): Promise<ParseResult> {
    const startTime = Date.now();
    const config = getRateconConfig();
    const extractionPrompt = await this.getExtractionPrompt();

    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text' as const, text: extractionPrompt },
          {
            type: 'file' as const,
            data: fileBuffer,
            mediaType: 'application/pdf' as const,
          },
        ],
      },
    ];

    // Stable digest for idempotency — file size + name uniquely identify the
    // upload across transient retries without hashing the whole buffer.
    const contentDigestInput = `vision|${aiContext?.attemptId ?? 'na'}|${fileName}|${fileBuffer.length}`;

    // Attempt 1: Primary model
    let primaryInvocationId: string | undefined;
    try {
      this.logger.log(
        `Vision: sending to ${config.modelAlias} model for ${fileName} (timeout: ${config.timeoutMs}ms, fallback: ${config.fallbackEnabled})`,
      );
      const result = await this.structuredOutputService.extract({
        messages,
        schema: RateconExtractionSchema,
        modelAlias: config.modelAlias,
        model: config.getModel(config.modelAlias),
        systemPrompt: RATECON_AGENT_INSTRUCTIONS,
        timeoutMs: config.timeoutMs,
        enforceBudget: true,
        aiContext: aiContext
          ? {
              tenantId: aiContext.tenantId,
              surface: AiSurface.DOC_RATECON,
              agentId: 'ratecon-parser-vision',
              linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
              linkRefId: aiContext.linkRefId,
              idempotencyKey: buildIdempotencyKey(
                {
                  surface: AiSurface.DOC_RATECON,
                  linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
                  linkRefId: aiContext.linkRefId,
                },
                'primary',
                contentDigestInput,
              ),
            }
          : undefined,
      });
      primaryInvocationId = result.aiInvocationId;

      if (result.object) {
        const parsed = this.finalizeExtraction(result.object, fileName);
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Vision (${config.modelAlias}/${config.provider}) succeeded for ${fileName} in ${durationMs}ms — load: ${parsed.load_number}, rate: $${parsed.rate_total_usd}`,
        );
        return {
          data: parsed,
          parsing: {
            requestedStrategy: 'vision',
            actualStrategy: 'vision',
            fallbackUsed: false,
            fallbackReason: null,
            textExtractionChars: null,
            model: config.modelAlias,
            durationMs,
          },
        };
      }

      this.logger.warn(`Vision (${config.modelAlias}) structuredOutput returned no object for ${fileName}`);
    } catch (error) {
      this.logger.warn(
        `Vision (${config.modelAlias}) failed for ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // If fallback is disabled, fail immediately
    if (!config.fallbackEnabled) {
      const durationMs = Date.now() - startTime;
      this.logger.error(
        `Vision failed for ${fileName} (${config.modelAlias}/${config.provider}, ${durationMs}ms). Fallback is disabled (set RATECON_FALLBACK_ENABLED=true to enable).`,
      );
      throw new BadRequestException(
        `Failed to parse rate confirmation PDF "${fileName}". The ${config.modelAlias} model could not extract data.`,
      );
    }

    // Attempt 2: Fallback model
    try {
      this.logger.log(
        `Vision: falling back to ${config.fallbackModelAlias} model for ${fileName} (timeout: ${config.fallbackTimeoutMs}ms)`,
      );
      const result = await this.structuredOutputService.extract({
        messages,
        schema: RateconExtractionSchema,
        modelAlias: config.fallbackModelAlias,
        model: config.getModel(config.fallbackModelAlias),
        systemPrompt: RATECON_AGENT_INSTRUCTIONS,
        timeoutMs: config.fallbackTimeoutMs,
        enforceBudget: true,
        aiContext: aiContext
          ? {
              tenantId: aiContext.tenantId,
              surface: AiSurface.DOC_RATECON,
              agentId: 'ratecon-parser-vision-fallback',
              linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
              linkRefId: aiContext.linkRefId,
              parentInvocationId: primaryInvocationId,
              idempotencyKey: buildIdempotencyKey(
                {
                  surface: AiSurface.DOC_RATECON,
                  linkRefType: AI_LINK_REF_TYPES.DOCUMENT,
                  linkRefId: aiContext.linkRefId,
                },
                'fallback',
                contentDigestInput,
              ),
            }
          : undefined,
      });

      if (result.object) {
        const parsed = this.finalizeExtraction(result.object, fileName);
        const durationMs = Date.now() - startTime;
        this.logger.log(
          `Vision (${config.fallbackModelAlias}) succeeded for ${fileName} in ${durationMs}ms — load: ${parsed.load_number}, rate: $${parsed.rate_total_usd}`,
        );
        return {
          data: parsed,
          parsing: {
            requestedStrategy: 'vision',
            actualStrategy: 'vision',
            fallbackUsed: true,
            fallbackReason: 'standard_model_failed',
            textExtractionChars: null,
            model: config.fallbackModelAlias,
            durationMs,
          },
        };
      }

      throw new InternalServerErrorException('Document parsing failed — please try again or upload a clearer document');
    } catch (error) {
      this.logger.error(`Vision failed for ${fileName} on both models`, error);
      throw this.classifyError(error, fileName);
    }
  }

  /**
   * Classify errors into user-facing exceptions.
   */
  private classifyError(error: unknown, fileName: string): Error {
    const message = error instanceof Error ? error.message : JSON.stringify(error);

    if (message.includes('401') || message.includes('auth') || message.includes('API key')) {
      return new InternalServerErrorException(
        `AI service authentication failed. Please check your ${getRequiredAiEnvVar()}.`,
      );
    }
    if (message.includes('429') || message.includes('rate limit')) {
      return new InternalServerErrorException('AI service rate limit exceeded. Please try again in a moment.');
    }
    return new BadRequestException(
      `Failed to parse rate confirmation PDF "${fileName}". Please ensure the file is a valid rate confirmation document.`,
    );
  }
}
