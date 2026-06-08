import { z } from 'zod';

/**
 * Zod schema for structured output from rate confirmation PDF parsing.
 * Used with Mastra agent.generate() structuredOutput for provider-level schema enforcement.
 *
 * Designed to be forgiving — only fields that are ALWAYS present on ratecons
 * are required. Everything else is optional so the model can succeed even
 * with sparse documents (e.g., Armstrong loads with no commodity/weight).
 *
 * Based on analysis of 13 real ratecon PDFs from:
 * - Armstrong Transport Group (Carrier Rate Confirmation via Highway)
 * - Arrive Logistics (Carrier Load Confirmation)
 * - American Logistics Group (Rate Confirmation)
 * - IL2000 / eShipping (Carrier Confirmation)
 */
/**
 * Extraction-only schema — sent to the LLM.
 * Does NOT include confidence (computed deterministically after extraction).
 * This is much faster for structured output (~33s vs ~114s with confidence).
 */
export const RateconExtractionSchema = z.object({
  // ── Load identification (always present) ──────────────────────────
  load_number: z
    .string()
    .describe(
      'The broker/shipper load number, order number, or BOL number. ' +
        'Examples: "4141754-1", "8481647", "358392", "PEP510761"',
    ),

  // ── Broker/customer info ──────────────────────────────────────────
  broker_name: z
    .string()
    .describe(
      'Name of the broker or shipping company. ' +
        'Examples: "Armstrong Transport Group", "Arrive Logistics", "American Logistics Group", "IL2000"',
    ),
  broker_mc: z.string().optional().describe('Broker MC number if listed (e.g., "546542")'),

  // ── Shipment details (often missing on sparse ratecons) ───────────
  equipment_type: z
    .string()
    .optional()
    .describe('Required equipment type. Examples: "Van", "53\' Van", "Van Or Reefer", "Reefer", "Flatbed"'),
  commodity: z
    .string()
    .optional()
    .describe('Type of product being shipped (e.g., "Paper", "beer", "Bottle Water", "Foamboard")'),
  weight_lbs: z
    .number()
    .optional()
    .describe(
      'Total weight in pounds as a number. Ignore placeholder values like 1.00 lbs. ' + 'Examples: 42762, 35000, 12000',
    ),
  pieces: z.number().optional().describe('Number of pieces, pallets, or packaging units as a number'),
  miles: z.number().optional().describe('Total miles for the route if listed'),

  // ── Rate (always present) ─────────────────────────────────────────
  rate_total_usd: z
    .number()
    .describe(
      'Total rate amount in USD as a plain number. Strip $ signs and commas. ' +
        'Examples: 850.00, 1150.00, 1200.00. ' +
        'Use the "Total" or "Total Rate" or "Total Amt Due" line.',
    ),

  // ── Stops (always present — at least 1 pickup + 1 delivery) ──────
  stops: z
    .array(
      z.object({
        sequence: z.number().describe('Stop order: 1 for first pickup, 2 for second stop, etc.'),
        action_type: z
          .enum(['pickup', 'delivery'])
          .describe(
            'Determine from context: "Pickup", "Pick", "SHIP FROM" = pickup. ' +
              '"Delivery", "Dropoff", "Drop", "SHIP TO", "Stop", "Consignee" = delivery. ' +
              'If only 2 stops, first is pickup and second is delivery.',
          ),
        facility_name: z
          .string()
          .describe(
            'Name of the facility, warehouse, or company at this stop. ' +
              'If no name is given, leave it empty — do not invent a placeholder.',
          ),
        address: z
          .string()
          .optional()
          .describe(
            'Street address (e.g., "76 MAIN ST", "202 PORT JERSEY BLVD"). Leave empty if not clearly present in the document.',
          ),
        city: z.string().optional().describe('City name. Leave empty if not clearly determinable from the document.'),
        state: z
          .string()
          .optional()
          .describe(
            'US state as 2-letter abbreviation (e.g., "NJ", "MA", "NY", "PA"). Leave empty if not clearly determinable from the document.',
          ),
        zip_code: z
          .string()
          .optional()
          .describe(
            '5-digit ZIP code (e.g., "01889", "07305", "11717"). Leave empty if not clearly present in the document.',
          ),
        appointment_date: z.string().optional().describe('Appointment date in YYYY-MM-DD format (e.g., "2026-03-12")'),
        appointment_time: z
          .string()
          .optional()
          .describe(
            'Appointment time in HH:MM 24-hour format. ' +
              'Convert from any format: "0330" → "03:30", "13:00 EDT" → "13:00", "6:00 AM" → "06:00". ' +
              'IMPORTANT: If time is already in HH:MM or H:MM without AM/PM, treat as 24-hour. Do NOT assume PM. ' +
              '"02:15" = 02:15 (not 14:15). Only convert to PM when document explicitly says "PM".',
          ),
      }),
    )
    .describe('Ordered list of stops. Pickups first, then deliveries.'),

  // ── Special instructions (summarized) ─────────────────────────────
  special_instructions: z
    .string()
    .optional()
    .describe(
      'Key operational instructions only: tracking requirements, PPE, detention policy, ' +
        'equipment requirements, temperature settings. ' +
        'Omit payment terms, legal boilerplate, and invoice instructions.',
    ),
});

export type RateconExtraction = z.infer<typeof RateconExtractionSchema>;

// ── Confidence schema (computed deterministically, not by LLM) ──────
const ConfidenceLevel = z.enum(['high', 'medium', 'low']);

const RateconConfidenceSchema = z.object({
  reference_number: ConfidenceLevel,
  broker_name: ConfidenceLevel,
  rate: ConfidenceLevel,
  stops: z.array(
    z.object({
      sequence: z.number(),
      location: ConfidenceLevel,
      date: ConfidenceLevel.nullable(),
    }),
  ),
});

export type RateconConfidence = z.infer<typeof RateconConfidenceSchema>;

/**
 * Full schema — extraction data + computed confidence.
 * This is what downstream consumers (processor, frontend) expect.
 */
export const RateconSchema = RateconExtractionSchema.extend({
  confidence: RateconConfidenceSchema.optional(),
});

export type RateconData = z.infer<typeof RateconSchema>;

// ── Deterministic confidence scorer ─────────────────────────────────
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const STATE_REGEX = /^[A-Z]{2}$/;
const ZIP_REGEX = /^\d{5}$/;

/**
 * Computes confidence deterministically from extracted data.
 * Rules:
 *   - "high"   = field is present, non-empty, and well-formed
 *   - "medium" = field is present but incomplete or suspiciously short
 *   - "low"    = field is missing, empty, or uses a placeholder
 */
export function computeConfidence(data: RateconExtraction): RateconConfidence {
  return {
    reference_number: data.load_number && data.load_number.length > 1 ? 'high' : 'low',
    broker_name: scoreBrokerName(data.broker_name),
    rate: data.rate_total_usd > 0 ? 'high' : 'low',
    stops: data.stops.map((stop) => ({
      sequence: stop.sequence,
      location: scoreStopLocation(stop),
      date: stop.appointment_date ? scoreDate(stop.appointment_date) : null,
    })),
  };
}

function scoreBrokerName(name: string | undefined): 'high' | 'medium' | 'low' {
  if (!name) return 'low';
  if (name.length < 3) return 'low';
  // Single word or very short → medium (could be abbreviated)
  if (!name.includes(' ') && name.length < 10) return 'medium';
  return 'high';
}

function scoreStopLocation(stop: {
  facility_name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
}): 'high' | 'medium' | 'low' {
  const hasCity = !!stop.city && stop.city.length > 1;
  const hasState = !!stop.state && STATE_REGEX.test(stop.state);
  const hasZip = !!stop.zip_code && ZIP_REGEX.test(stop.zip_code);
  const hasAddress = !!stop.address && stop.address.length > 3;
  const hasRealFacility =
    !!stop.facility_name && stop.facility_name !== 'Unknown Facility' && stop.facility_name.length > 1;

  // Full address: city + state + zip + street → high
  if (hasCity && hasState && hasZip && hasAddress) return 'high';
  // At least city + state → medium
  if (hasCity && hasState) return 'medium';
  // Has some location data but incomplete
  if (hasCity || hasState || hasRealFacility) return 'medium';
  return 'low';
}

function scoreDate(date: string): 'high' | 'medium' | 'low' {
  if (DATE_REGEX.test(date)) return 'high';
  // Has some date-like content but not in YYYY-MM-DD format
  if (date.length > 3) return 'medium';
  return 'low';
}

export interface ParsingMetadata {
  requestedStrategy: 'text-first' | 'vision';
  actualStrategy: 'text-first' | 'vision';
  fallbackUsed: boolean;
  fallbackReason:
    | 'fast_model_failed'
    | 'standard_model_failed'
    | 'text_extraction_too_short'
    | 'scrambled_layout'
    | null;
  textExtractionChars: number | null;
  model: string;
  durationMs: number;
}

export interface ParseResult {
  data: RateconData;
  parsing: ParsingMetadata;
}
