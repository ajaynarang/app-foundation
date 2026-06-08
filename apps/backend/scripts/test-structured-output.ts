/**
 * Test script to verify direct AI SDK structured output works for all 4 call sites.
 * Run: cd apps/backend && npx tsx scripts/test-structured-output.ts
 *
 * Tests:
 * 1. Ratecon (text-first) — real PDF
 * 2. Fuel receipt — synthetic data
 * 3. Shield analyst — synthetic compliance data
 * 4. Search query parser — natural language query
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { generateText, Output } from 'ai';
import { createGateway } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// Re-import schemas
import {
  RateconExtractionSchema,
  computeConfidence,
} from '../src/domains/ai/document-intelligence/ratecon/ratecon.schema';
import { FuelReceiptSchema } from '../src/domains/ai/document-intelligence/fuel-receipt/fuel-receipt.schema';

const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

const models = {
  fast: gateway('anthropic/claude-haiku-4.5'),
  standard: gateway('anthropic/claude-sonnet-4.6'),
};

// Shield schema (inline — same as shield-ai.schema.ts)
const ShieldFindingSchema = z.object({
  ruleId: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string(),
  description: z.string(),
  recommendation: z.string(),
  dataPoints: z.array(z.string()).optional(),
});

const ShieldAIResponseSchema = z.object({
  findings: z.array(ShieldFindingSchema),
  insights: z.array(z.string()),
  priorityActions: z.array(z.string()),
  skippedRules: z.array(z.object({ ruleId: z.string(), reason: z.string() })),
});

// Search query schema (inline — same as search-query-parser.ts)
const SearchExtractionSchema = z.object({
  originCity: z.string().nullable().describe('Origin city name'),
  originState: z.string().nullable().describe('Origin state (2-letter)'),
  destinationCity: z.string().nullable().describe('Destination city name'),
  destinationState: z.string().nullable().describe('Destination state (2-letter)'),
  equipmentTypes: z.array(z.string()).describe('Equipment types: Van, Reefer, Flatbed, etc.'),
  minRate: z.number().nullable().describe('Minimum rate in USD'),
  maxRate: z.number().nullable().describe('Maximum rate in USD'),
  maxDeadheadMiles: z.number().nullable().describe('Maximum deadhead miles'),
  maxWeight: z.number().nullable().describe('Maximum weight in lbs'),
});

interface TestResult {
  name: string;
  success: boolean;
  durationMs: number;
  model: string;
  error?: string;
  extractedData?: any;
}

const results: TestResult[] = [];

async function testRatecon() {
  const pdfPath = '/Users/ajay-admin/Downloads/NR-Brooklyn NY-Oscar.pdf';
  if (!fs.existsSync(pdfPath)) {
    results.push({
      name: 'Ratecon (text-first)',
      success: false,
      durationMs: 0,
      model: 'standard',
      error: 'PDF file not found',
    });
    return;
  }

  // Extract text from PDF
  const { PDFParse } = await import('pdf-parse');
  const fileBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
  const pdfData = await parser.getText();
  const pdfText = pdfData.text;

  const systemPrompt =
    'You are a document extraction agent for a trucking company. Extract structured data from rate confirmation documents.\n\n' +
    'CRITICAL RULES:\n' +
    '- Extract ONLY what is explicitly written in the document\n' +
    '- NEVER infer, guess, or complete partial addresses from context\n' +
    '- If a field is partially readable, extract what you can and leave unclear parts empty\n' +
    '- If city or state cannot be determined from the document text, leave them empty — do not guess\n' +
    '- For each field, honestly assess your confidence: high (clearly readable), medium (partial/abbreviated), low (mostly guessed)\n' +
    '- Return valid JSON matching the requested schema';

  const extractionPrompt = `You are a rate confirmation document extraction agent for a trucking/freight company.
Extract structured data from the following rate confirmation document text.

EXTRACTION RULES:
1. LOAD NUMBER: Look for "Load #", "Order", "BOL #", or similar.
2. BROKER NAME: The company issuing the ratecon.
3. RATE: The total dollar amount.
4. STOPS: At least one pickup and one delivery with addresses, dates, times.
5. WEIGHT: In pounds. Ignore placeholder values like "1.00 lbs".
6. CONFIDENCE: Self-report high/medium/low for each critical field.`;

  const userMessage = `${extractionPrompt}\n\n---\nRATE CONFIRMATION DOCUMENT TEXT:\n---\n${pdfText}`;

  const start = Date.now();
  try {
    const output = (Output as any).object({ schema: RateconExtractionSchema });
    const result: any = await (generateText as any)({
      model: models.standard,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      output,
      abortSignal: AbortSignal.timeout(180_000),
    });

    const obj = result.output;
    if (obj) {
      const extraction = RateconExtractionSchema.parse(obj);
      const confidence = computeConfidence(extraction);
      results.push({
        name: 'Ratecon (text-first)',
        success: true,
        durationMs: Date.now() - start,
        model: 'standard (Sonnet)',
        extractedData: {
          load_number: extraction.load_number,
          broker_name: extraction.broker_name,
          rate: extraction.rate_total_usd,
          stops: extraction.stops.length,
          pickup: extraction.stops[0] ? `${extraction.stops[0].city}, ${extraction.stops[0].state}` : 'N/A',
          delivery: extraction.stops[1] ? `${extraction.stops[1].city}, ${extraction.stops[1].state}` : 'N/A',
          confidence_ref: confidence.reference_number,
          confidence_rate: confidence.rate,
          confidence_stops: confidence.stops.map((s) => `${s.sequence}:${s.location}/${s.date}`),
        },
      });
    } else {
      results.push({
        name: 'Ratecon (text-first)',
        success: false,
        durationMs: Date.now() - start,
        model: 'standard (Sonnet)',
        error: 'output was null',
      });
    }
  } catch (e: any) {
    results.push({
      name: 'Ratecon (text-first)',
      success: false,
      durationMs: Date.now() - start,
      model: 'standard (Sonnet)',
      error: e.message,
    });
  }
}

async function testFuelReceipt() {
  const systemPrompt =
    'You are a fuel receipt extraction agent for a trucking/freight company. ' +
    'Extract structured data from fuel receipt text.\n\n' +
    'CRITICAL RULES:\n' +
    '- Extract ONLY what is explicitly present\n' +
    '- Return null for any field you cannot confidently read\n' +
    '- Do NOT guess or fabricate values';

  const receiptText = `PILOT TRAVEL CENTER #892
1234 Interstate Blvd
Memphis, TN 38118

Date: 03/20/2026  Time: 14:32
Pump #: 7
Driver: SMITH, J

Fuel Type: DIESEL #2
Gallons: 125.500
Price/Gal: $3.459
Subtotal: $434.10
Federal Tax: $30.74
State Tax: $19.10
TOTAL: $483.94

Card: **** 4521
Auth: 892716
Thank you for stopping at Pilot!`;

  const start = Date.now();
  try {
    const output = (Output as any).object({ schema: FuelReceiptSchema });
    const result: any = await (generateText as any)({
      model: models.fast,
      system: systemPrompt,
      messages: [{ role: 'user', content: receiptText }],
      output,
      abortSignal: AbortSignal.timeout(30_000),
    });

    const obj = result.output;
    if (obj) {
      const parsed = FuelReceiptSchema.parse(obj);
      results.push({
        name: 'Fuel Receipt',
        success: true,
        durationMs: Date.now() - start,
        model: 'fast (Haiku)',
        extractedData: {
          vendor: parsed.vendorName,
          gallons: parsed.gallons,
          total: parsed.totalAmount,
          state: parsed.state,
        },
      });
    } else {
      results.push({
        name: 'Fuel Receipt',
        success: false,
        durationMs: Date.now() - start,
        model: 'fast (Haiku)',
        error: 'output was null',
      });
    }
  } catch (e: any) {
    results.push({
      name: 'Fuel Receipt',
      success: false,
      durationMs: Date.now() - start,
      model: 'fast (Haiku)',
      error: e.message,
    });
  }
}

async function testShieldAnalyst() {
  const systemPrompt =
    'You are a compliance analyst for a trucking company. Analyze the provided data ' +
    'for compliance issues and return structured findings.\n\n' +
    'CRITICAL RULES:\n' +
    '- Only flag issues you can clearly identify from the data\n' +
    '- Provide actionable recommendations\n' +
    '- Assess severity accurately';

  const complianceData = `DRIVER COMPLIANCE CHECK — John Smith (CDL: TX12345678)
License Expiry: 2026-04-15 (expires in 22 days)
Medical Card: EXPIRED 2026-03-01
Last Drug Test: 2025-09-20 (over 6 months ago)
HOS Violations (last 30 days): 2 — 11-hour driving limit exceeded on 3/10 and 3/15
Vehicle Inspection: Current (expires 2026-08-01)
Insurance: Active (expires 2026-12-31)
Training Certifications: Hazmat EXPIRED 2025-12-01`;

  const start = Date.now();
  try {
    const output = (Output as any).object({
      schema: ShieldAIResponseSchema,
    });
    const result: any = await (generateText as any)({
      model: models.fast,
      system: systemPrompt,
      messages: [{ role: 'user', content: complianceData }],
      output,
      abortSignal: AbortSignal.timeout(30_000),
    });

    const obj = result.output;
    if (obj) {
      const parsed = ShieldAIResponseSchema.parse(obj);
      results.push({
        name: 'Shield Analyst',
        success: true,
        durationMs: Date.now() - start,
        model: 'fast (Haiku)',
        extractedData: {
          findings: parsed.findings.length,
          criticalFindings: parsed.findings.filter((f) => f.severity === 'critical').length,
          insights: parsed.insights.length,
          actions: parsed.priorityActions.length,
        },
      });
    } else {
      results.push({
        name: 'Shield Analyst',
        success: false,
        durationMs: Date.now() - start,
        model: 'fast (Haiku)',
        error: 'output was null',
      });
    }
  } catch (e: any) {
    results.push({
      name: 'Shield Analyst',
      success: false,
      durationMs: Date.now() - start,
      model: 'fast (Haiku)',
      error: e.message,
    });
  }
}

async function testSearchQuery() {
  const systemPrompt = `You are a search query parser for a freight load board. Extract structured search parameters from natural language queries about available truck loads.
Parse the user's query into structured search filters. Only extract fields that are explicitly mentioned.`;

  const query = 'van loads from Dallas TX to Chicago under $2000 max 500 miles';

  const start = Date.now();
  try {
    const output = (Output as any).object({
      schema: SearchExtractionSchema,
    });
    const result: any = await (generateText as any)({
      model: models.fast,
      system: systemPrompt,
      messages: [{ role: 'user', content: query }],
      output,
      abortSignal: AbortSignal.timeout(15_000),
    });

    const obj = result.output;
    if (obj) {
      const parsed = SearchExtractionSchema.parse(obj);
      results.push({
        name: 'Search Query',
        success: true,
        durationMs: Date.now() - start,
        model: 'fast (Haiku)',
        extractedData: {
          origin: `${parsed.originCity}, ${parsed.originState}`,
          destination: `${parsed.destinationCity}, ${parsed.destinationState}`,
          equipment: parsed.equipmentTypes,
          maxRate: parsed.maxRate,
        },
      });
    } else {
      results.push({
        name: 'Search Query',
        success: false,
        durationMs: Date.now() - start,
        model: 'fast (Haiku)',
        error: 'output was null',
      });
    }
  } catch (e: any) {
    results.push({
      name: 'Search Query',
      success: false,
      durationMs: Date.now() - start,
      model: 'fast (Haiku)',
      error: e.message,
    });
  }
}

async function main() {
  console.log('Testing direct AI SDK structured output (bypassing Mastra)...\n');
  console.log(`AI_GATEWAY_API_KEY: ${process.env.AI_GATEWAY_API_KEY ? 'set' : 'NOT SET'}`);
  console.log(`Provider: ai-sdk (direct generateText + Output.object)\n`);

  await testRatecon();
  console.log(`  [1/4] Ratecon: ${results[0].success ? 'PASS' : 'FAIL'} (${results[0].durationMs}ms)`);

  await testFuelReceipt();
  console.log(`  [2/4] Fuel Receipt: ${results[1].success ? 'PASS' : 'FAIL'} (${results[1].durationMs}ms)`);

  await testShieldAnalyst();
  console.log(`  [3/4] Shield: ${results[2].success ? 'PASS' : 'FAIL'} (${results[2].durationMs}ms)`);

  await testSearchQuery();
  console.log(`  [4/4] Search Query: ${results[3].success ? 'PASS' : 'FAIL'} (${results[3].durationMs}ms)`);

  // Print results table
  console.log('\n' + '='.repeat(90));
  console.log('RESULTS — Direct AI SDK Structured Output');
  console.log('='.repeat(90));
  console.log('Call Site'.padEnd(22) + 'Status'.padEnd(10) + 'Duration'.padEnd(12) + 'Model'.padEnd(20) + 'Details');
  console.log('-'.repeat(90));

  for (const r of results) {
    const status = r.success ? 'PASS' : 'FAIL';
    const duration = `${r.durationMs}ms`;
    const details = r.success ? JSON.stringify(r.extractedData) : r.error || 'unknown error';
    console.log(r.name.padEnd(22) + status.padEnd(10) + duration.padEnd(12) + r.model.padEnd(20) + details);
  }

  console.log('='.repeat(90));
  const passed = results.filter((r) => r.success).length;
  console.log(`\n${passed}/4 tests passed`);

  if (passed < 4) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
