/**
 * Test ratecon parser against real PDF files.
 *
 * Directly calls the Anthropic API via Mastra agent with structuredOutput,
 * bypassing BullMQ/NestJS — tests the same code path the parser service uses.
 *
 * Usage:
 *   cd apps/backend
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/test-ratecon-parser.ts <pdf-dir-or-file> [--strategy vision]
 *
 * Examples:
 *   npx tsx scripts/test-ratecon-parser.ts ../../.docs/research/ratecon/ratecon-mar12/
 *   npx tsx scripts/test-ratecon-parser.ts ../../.docs/research/ratecon/ratecon-mar12/NR-Albany\ NY-Rei.pdf
 *   npx tsx scripts/test-ratecon-parser.ts ../../.docs/research/ratecon/ratecon-mar13/ --strategy vision
 */
import { config } from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local first (secrets), then .env as fallback — same as NestJS ConfigModule
config({ path: path.resolve(__dirname, '..', '.env.local') });
config({ path: path.resolve(__dirname, '..', '.env') });
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGateway } from 'ai';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { RateconSchema, type RateconData } from '../src/domains/ai/document-intelligence/ratecon/ratecon.schema';

// The same fallback prompt from ratecon-parser.service.ts
const EXTRACTION_PROMPT = `You are a rate confirmation document extraction agent for a trucking/freight company.

Your job is to extract structured data from rate confirmation (ratecon) PDFs. These documents confirm load details between a freight broker and a carrier.

EXTRACTION RULES:

1. LOAD NUMBER: Always present. Look for "Load #", "Order", "BOL #", "Shipment ID", or similar. Extract the exact alphanumeric value.

2. BROKER NAME: The company issuing the ratecon. Look for the broker/logistics company name in the header or footer. Common examples: "Armstrong Transport Group", "Arrive Logistics", "American Logistics Group", "IL2000".

3. RATE: Always present. Look for "Total", "Total Rate", "Total Amt Due", or the final dollar amount. Extract as a plain number without $ or commas (e.g., 1150.00 not "$1,150.00"). If multiple rate lines exist, use the TOTAL line.

4. STOPS: Every ratecon has at least one pickup and one delivery.
   - PICKUP indicators: "Pickup", "Pick", "SHIP FROM", "Origin", first stop listed
   - DELIVERY indicators: "Delivery", "Dropoff", "Drop", "SHIP TO", "Consignee", "Stop", last stop listed
   - If exactly 2 stops with no labels, the first is pickup and second is delivery
   - Extract the full address: street, city, state (2-letter), ZIP (5-digit)
   - Facility name: use the company/warehouse name. If none given, use "Unknown Facility"
   - Dates: convert to YYYY-MM-DD format
   - Times: convert to HH:MM 24-hour format (e.g., "0330" → "03:30", "1PM" → "13:00")

5. WEIGHT: Extract in pounds as a number. Ignore placeholder values like "1.00 lbs" — leave empty instead.

6. SPECIAL INSTRUCTIONS: Summarize key operational requirements only (tracking, PPE, detention policy, temperature, equipment specs). Omit payment terms, invoice instructions, and legal boilerplate.

7. OPTIONAL FIELDS: Leave empty/omit if not present in the document. Do not guess or fabricate values.`;

// ── Setup ──────────────────────────────────────────────────────────────

function setupAgent(modelAlias: 'fast' | 'standard') {
  const aiProvider = process.env.AI_PROVIDER || 'gateway';

  let model;

  if (aiProvider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ERROR: ANTHROPIC_API_KEY is not set. Add it to .env.local or pass it as env var.');
      process.exit(1);
    }
    const anthropic = createAnthropic({ apiKey });
    const modelId = modelAlias === 'fast' ? 'claude-haiku-4-5' : 'claude-sonnet-4-6';
    model = anthropic(modelId);
  } else {
    const apiKey = process.env.AI_GATEWAY_API_KEY;
    if (!apiKey) {
      console.error('ERROR: AI_GATEWAY_API_KEY is not set. Add it to .env.local or pass it as env var.');
      process.exit(1);
    }
    const gateway = createGateway({ apiKey });
    const modelId = modelAlias === 'fast' ? 'anthropic/claude-haiku-4.5' : 'anthropic/claude-sonnet-4.6';
    model = gateway(modelId);
  }

  console.log(`  [setup] Using ${aiProvider} provider for ${modelAlias}`);

  const agent = new Agent({
    id: `test-ratecon-parser-${modelAlias}`,
    name: `Test Ratecon Parser (${modelAlias})`,
    instructions:
      'You are a document extraction agent. Extract structured data from rate confirmation documents accurately. Return valid JSON matching the requested schema.',
    model,
  });

  // Create a minimal Mastra instance to register the agent
  const mastra = new Mastra({
    agents: { [`test-ratecon-parser-${modelAlias}`]: agent },
  });

  return mastra.getAgent(`test-ratecon-parser-${modelAlias}`);
}

// ── PDF Text Extraction (same as parser service) ──────────────────────

async function extractPdfText(fileBuffer: Buffer): Promise<string> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
  const pdfData = await parser.getText();
  return pdfData.text;
}

// ── Parse one file ────────────────────────────────────────────────────

interface ParseTestResult {
  fileName: string;
  success: boolean;
  model: string;
  durationMs: number;
  data?: RateconData;
  error?: string;
  textChars?: number;
}

async function parseFile(filePath: string, strategy: 'text-first' | 'vision'): Promise<ParseTestResult> {
  const fileName = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const startTime = Date.now();

  const fastAgent = setupAgent('fast');
  const standardAgent = setupAgent('standard');
  const structuredOpts = { schema: RateconSchema } as any;

  // Text-first strategy
  if (strategy === 'text-first') {
    let pdfText: string;
    try {
      pdfText = await extractPdfText(fileBuffer);
    } catch (e) {
      return {
        fileName,
        success: false,
        model: 'n/a',
        durationMs: Date.now() - startTime,
        error: `Text extraction failed: ${(e as Error).message}`,
      };
    }

    const userMessage = `${EXTRACTION_PROMPT}\n\n---\nRATE CONFIRMATION DOCUMENT TEXT:\n---\n${pdfText}`;
    const messages = [{ role: 'user' as const, content: userMessage }];

    // Try fast
    try {
      console.log(`  [fast] Sending ${pdfText.length} chars...`);
      const result = await fastAgent.generate(messages, {
        structuredOutput: structuredOpts,
        abortSignal: AbortSignal.timeout(90_000),
      });
      if (result.object) {
        const parsed = RateconSchema.parse(result.object);
        return {
          fileName,
          success: true,
          model: 'fast',
          durationMs: Date.now() - startTime,
          data: parsed,
          textChars: pdfText.length,
        };
      }
      console.log(`  [fast] No object returned, trying standard...`);
    } catch (e) {
      console.log(`  [fast] Failed: ${(e as Error).message}, trying standard...`);
    }

    // Try standard
    try {
      const result = await standardAgent.generate(messages, {
        structuredOutput: structuredOpts,
        abortSignal: AbortSignal.timeout(180_000),
      });
      if (result.object) {
        const parsed = RateconSchema.parse(result.object);
        return {
          fileName,
          success: true,
          model: 'standard',
          durationMs: Date.now() - startTime,
          data: parsed,
          textChars: pdfText.length,
        };
      }
      return {
        fileName,
        success: false,
        model: 'standard',
        durationMs: Date.now() - startTime,
        error: 'Both models returned no structured object',
        textChars: pdfText.length,
      };
    } catch (e) {
      return {
        fileName,
        success: false,
        model: 'standard',
        durationMs: Date.now() - startTime,
        error: (e as Error).message,
        textChars: pdfText.length,
      };
    }
  }

  // Vision strategy
  const messages = [
    {
      role: 'user' as const,
      content: [
        { type: 'text' as const, text: EXTRACTION_PROMPT },
        { type: 'file' as const, data: fileBuffer, mediaType: 'application/pdf' as const },
      ],
    },
  ];

  try {
    console.log(`  [fast/vision] Sending ${fileBuffer.length} bytes...`);
    const result = await fastAgent.generate(messages, {
      structuredOutput: structuredOpts,
      abortSignal: AbortSignal.timeout(90_000),
    });
    if (result.object) {
      const parsed = RateconSchema.parse(result.object);
      return { fileName, success: true, model: 'fast', durationMs: Date.now() - startTime, data: parsed };
    }
    console.log(`  [fast/vision] No object, trying standard...`);
  } catch (e) {
    console.log(`  [fast/vision] Failed: ${(e as Error).message}, trying standard...`);
  }

  try {
    const result = await standardAgent.generate(messages, {
      structuredOutput: structuredOpts,
      abortSignal: AbortSignal.timeout(180_000),
    });
    if (result.object) {
      const parsed = RateconSchema.parse(result.object);
      return { fileName, success: true, model: 'standard', durationMs: Date.now() - startTime, data: parsed };
    }
    return {
      fileName,
      success: false,
      model: 'standard',
      durationMs: Date.now() - startTime,
      error: 'Both models returned no structured object',
    };
  } catch (e) {
    return {
      fileName,
      success: false,
      model: 'standard',
      durationMs: Date.now() - startTime,
      error: (e as Error).message,
    };
  }
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const strategy = args.includes('--strategy')
    ? (args[args.indexOf('--strategy') + 1] as 'text-first' | 'vision')
    : 'text-first';
  const maxFiles = args.includes('--max') ? parseInt(args[args.indexOf('--max') + 1], 10) : 50;
  const inputPath = args.find(
    (a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--strategy' && args[args.indexOf(a) - 1] !== '--max',
  );

  if (!inputPath) {
    console.error('Usage: npx tsx scripts/test-ratecon-parser.ts <pdf-dir-or-file> [--strategy vision] [--max 5]');
    process.exit(1);
  }

  const resolvedPath = path.resolve(inputPath);
  let files: string[];

  if (fs.statSync(resolvedPath).isDirectory()) {
    files = fs
      .readdirSync(resolvedPath)
      .filter((f) => f.endsWith('.pdf'))
      .map((f) => path.join(resolvedPath, f))
      .slice(0, maxFiles);
  } else {
    files = [resolvedPath];
  }

  console.log(`\n🔍 Testing ${files.length} ratecon PDF(s) with strategy: ${strategy}\n`);

  const results: ParseTestResult[] = [];

  for (const file of files) {
    const fileName = path.basename(file);
    console.log(`\n━━━ ${fileName} ━━━`);
    const result = await parseFile(file, strategy);
    results.push(result);

    if (result.success && result.data) {
      const d = result.data;
      console.log(`  ✅ ${result.model} model, ${result.durationMs}ms`);
      console.log(`     Load:    ${d.load_number}`);
      console.log(`     Broker:  ${d.broker_name}`);
      console.log(`     Rate:    $${d.rate_total_usd}`);
      console.log(`     Equip:   ${d.equipment_type || '—'}`);
      console.log(`     Weight:  ${d.weight_lbs ? `${d.weight_lbs} lbs` : '—'}`);
      console.log(`     Stops:   ${d.stops.length}`);
      for (const s of d.stops) {
        console.log(
          `       ${s.sequence}. [${s.action_type}] ${s.facility_name} — ${s.address}, ${s.city}, ${s.state} ${s.zip_code} @ ${s.appointment_date || '?'} ${s.appointment_time || '?'}`,
        );
      }
      if (d.special_instructions) {
        console.log(`     Notes:   ${d.special_instructions.substring(0, 120)}...`);
      }
    } else {
      console.log(`  ❌ FAILED (${result.model}, ${result.durationMs}ms): ${result.error}`);
    }
  }

  // Summary
  console.log('\n\n═══ SUMMARY ═══');
  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed files:');
    for (const r of results.filter((r) => !r.success)) {
      console.log(`  ❌ ${r.fileName}: ${r.error}`);
    }
  }

  console.log(
    `\nAvg duration: ${Math.round(results.filter((r) => r.success).reduce((sum, r) => sum + r.durationMs, 0) / (passed || 1))}ms`,
  );
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
