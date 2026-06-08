import { z } from 'zod';

// ── Provider & Equipment Enums ──

export const LoadBoardProviderSchema = z.enum(['dat', 'truckstop', '123loadboard']);
export type LoadBoardProvider = z.infer<typeof LoadBoardProviderSchema>;

export const EquipmentTypeFilterSchema = z.enum(['van', 'reefer', 'flatbed', 'step_deck', 'power_only']);
export type EquipmentTypeFilter = z.infer<typeof EquipmentTypeFilterSchema>;

// ── Search ──

export const LoadBoardLocationSchema = z.object({
  city: z.string().min(1),
  state: z.string().length(2),
  radius: z.number().min(10).max(500).default(50),
});

export const LoadBoardSearchParamsSchema = z.object({
  origin: LoadBoardLocationSchema,
  destination: LoadBoardLocationSchema.optional(),
  equipmentType: z.array(EquipmentTypeFilterSchema).optional(),
  minRate: z.number().positive().optional(),
  maxDeadhead: z.number().positive().optional(),
  minWeight: z.number().positive().optional(),
  maxWeight: z.number().positive().optional(),
  pickupDateFrom: z.string().optional(),
  pickupDateTo: z.string().optional(),
  provider: LoadBoardProviderSchema,
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(25),
});
export type LoadBoardSearchParams = z.infer<typeof LoadBoardSearchParamsSchema>;

// ── Listing ──

export const LoadBoardBrokerSchema = z.object({
  name: z.string(),
  contact: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  mcNumber: z.string().optional(),
});
export type LoadBoardBroker = z.infer<typeof LoadBoardBrokerSchema>;

export const LoadBoardListingSchema = z.object({
  externalId: z.string(),
  provider: LoadBoardProviderSchema,
  origin: z.object({
    city: z.string(),
    state: z.string(),
    zipCode: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  destination: z.object({
    city: z.string(),
    state: z.string(),
    zipCode: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  rate: z.number(),
  ratePerMile: z.number(),
  distance: z.number(),
  deadheadMiles: z.number().optional(),
  equipmentType: z.string(),
  weight: z.number().optional(),
  commodity: z.string().optional(),
  pickupDate: z.string(),
  deliveryDate: z.string().optional(),
  broker: LoadBoardBrokerSchema,
  specialInstructions: z.string().optional(),
  referenceNumber: z.string().optional(),
  postedAt: z.string(),
  length: z.number().optional(),
  laneInsight: z.lazy(() => LaneInsightSchema).optional(),
});
export type LoadBoardListing = z.infer<typeof LoadBoardListingSchema>;

// ── Search Result ──

export const LoadBoardSearchResultSchema = z.object({
  listings: z.array(LoadBoardListingSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  hasMore: z.boolean(),
});
export type LoadBoardSearchResult = z.infer<typeof LoadBoardSearchResultSchema>;

// ── Import ──

export const LoadBoardImportResultSchema = z.object({
  loadNumber: z.string(),
});
export type LoadBoardImportResult = z.infer<typeof LoadBoardImportResultSchema>;

// ── Lane Insight (rate intelligence) ──

export const LaneInsightVerdictSchema = z.enum(['above_market', 'market_rate', 'below_market']);

export const LaneInsightSchema = z.object({
  avgRatePerMile: z.number(),
  percentDiff: z.number(),
  verdict: LaneInsightVerdictSchema,
  loadCount: z.number(),
});
export type LaneInsight = z.infer<typeof LaneInsightSchema>;
