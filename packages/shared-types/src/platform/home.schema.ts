import { z } from 'zod';

// ── Home Pulse (GET /home/pulse) ──

export const HomePulseSchema = z.object({
  activeLoads: z.number(),
  alertCount: z.number(),
  pendingDecisions: z.number(),
  unbilledCents: z.number(),
});
export type HomePulse = z.infer<typeof HomePulseSchema>;

// ── Recent Loads (GET /home/recent-loads) ──

export const RecentLoadSchema = z.object({
  id: z.string(),
  loadNumber: z.string(),
  referenceNumber: z.string().nullable(),
  originCity: z.string().nullable(),
  originState: z.string().nullable(),
  destinationCity: z.string().nullable(),
  destinationState: z.string().nullable(),
  status: z.string(),
  driverName: z.string().nullable(),
  updatedAt: z.string(),
});
export type RecentLoad = z.infer<typeof RecentLoadSchema>;
