import { z } from 'zod';

/**
 * MIME types accepted for fuel receipt uploads.
 * Single source of truth — imported by both the controller and parser service.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/**
 * Zod schema for structured output from fuel receipt image parsing.
 * Used with Mastra agent.generate() structuredOutput.
 *
 * All fields are nullable — receipts can be blurry, partial, or faded.
 * The AI returns null for any field it cannot confidently read.
 */
export const FuelReceiptSchema = z.object({
  purchaseDate: z
    .string()
    .nullable()
    .describe('Purchase date in YYYY-MM-DD format. Look for date/time stamps on the receipt.'),
  gallons: z
    .number()
    .nullable()
    .describe(
      'Total fuel quantity in gallons. Look for "Gallons", "Gal", "Volume", "Qty". ' +
        'Extract as decimal (e.g., 85.500).',
    ),
  pricePerGallon: z
    .number()
    .nullable()
    .describe(
      'Unit price per gallon. Look for "Price/Gal", "Unit Price", "PPG". ' + 'Extract as decimal (e.g., 3.459).',
    ),
  totalAmount: z
    .number()
    .nullable()
    .describe(
      'Final charge in dollars. Look for "Total", "Amount Due", "Sale". ' +
        'Extract as decimal (e.g., 295.74). Use the final/largest fuel total.',
    ),
  vendorName: z
    .string()
    .nullable()
    .describe(
      'Fuel station brand or name. Look for logos, headers, "Welcome to..." text. ' +
        'Examples: "Pilot", "Love\'s", "Flying J", "TA", "Petro".',
    ),
  stationAddress: z.string().nullable().describe('Street address of the station if visible.'),
  city: z.string().nullable().describe('City name if visible on the receipt.'),
  state: z
    .string()
    .nullable()
    .describe(
      'US state as 2-letter code (e.g., "TN", "TX"). Critical for IFTA jurisdiction. ' +
        'Prioritize extracting this field.',
    ),
  zipCode: z.string().nullable().describe('5-digit ZIP code if visible.'),
  fuelType: z.string().nullable().describe('Fuel type: "Diesel", "DEF", "Unleaded", "Premium", etc.'),
  taxAmount: z.number().nullable().describe('Total fuel tax amount in dollars if the receipt itemizes taxes.'),
  federalTax: z.number().nullable().describe('Federal fuel tax in dollars if broken out separately on the receipt.'),
  stateTax: z.number().nullable().describe('State fuel tax in dollars if broken out separately on the receipt.'),
});

export type FuelReceiptData = z.infer<typeof FuelReceiptSchema>;

/** Number of extractable fields in FuelReceiptSchema — used in API response metadata. */
export const FUEL_RECEIPT_FIELD_COUNT = Object.keys(FuelReceiptSchema.shape).length;

export interface FuelReceiptParseResult {
  data: FuelReceiptData;
  parsing: FuelReceiptParsingMetadata;
}

export interface FuelReceiptParsingMetadata {
  model: string;
  fallbackUsed: boolean;
  fallbackReason: 'fast_model_failed' | null;
  durationMs: number;
}
