import { z } from 'zod';

const US_STATE_CODES = [
  'AL',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'FL',
  'GA',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
] as const;

export const usStateCodeSchema = z.enum(US_STATE_CODES);

export const createFuelPurchaseSchema = z.object({
  purchaseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  jurisdiction: usStateCodeSchema,
  gallons: z.number().positive().max(500),
  pricePerGallon: z.number().positive().max(10).optional(),
  totalCostCents: z.number().int().positive().optional(),
  stationName: z.string().max(200).optional(),
  vehicleId: z.number().int().positive().optional(),
  driverId: z.number().int().positive().optional(),
  notes: z.string().max(500).optional(),
});

export const createManualMileageSchema = z.object({
  jurisdiction: usStateCodeSchema,
  totalMiles: z.number().positive().max(50000),
  vehicleId: z.number().int().positive().optional(),
  year: z.number().int().min(2020).max(2030),
  quarter: z.number().int().min(1).max(4),
  notes: z.string().max(500).optional(),
});

export const updateFilingStatusSchema = z.object({
  status: z.enum(['REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED']),
  filingMethod: z.enum(['manual', 'electronic', 'accountant']).optional(),
  confirmationNumber: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export const queryIftaQuartersSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2030).optional(),
  status: z.enum(['OPEN', 'CALCULATING', 'DRAFT', 'REVIEWED', 'FILED', 'CONFIRMED', 'AMENDED']).optional(),
});

export type CreateFuelPurchaseInput = z.infer<typeof createFuelPurchaseSchema>;
export type CreateManualMileageInput = z.infer<typeof createManualMileageSchema>;
export type UpdateFilingStatusInput = z.infer<typeof updateFilingStatusSchema>;
export type QueryIftaQuartersInput = z.infer<typeof queryIftaQuartersSchema>;

export const fuelReceiptExtractionSchema = z.object({
  purchaseDate: z.string().nullable(),
  gallons: z.number().nullable(),
  pricePerGallon: z.number().nullable(),
  totalAmount: z.number().nullable(),
  vendorName: z.string().nullable(),
  stationAddress: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zipCode: z.string().nullable(),
  fuelType: z.string().nullable(),
  taxAmount: z.number().nullable(),
  federalTax: z.number().nullable(),
  stateTax: z.number().nullable(),
});

export type FuelReceiptExtraction = z.infer<typeof fuelReceiptExtractionSchema>;

export const fuelReceiptScanResponseSchema = z.object({
  extracted: fuelReceiptExtractionSchema,
  fieldsExtracted: z.number(),
  totalFields: z.number(),
});

export type FuelReceiptScanResponse = z.infer<typeof fuelReceiptScanResponseSchema>;
