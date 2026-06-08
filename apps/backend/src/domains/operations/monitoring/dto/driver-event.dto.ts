import { z } from 'zod';

// Driver taps "Start Route"
export const StartRouteSchema = z.object({
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type StartRouteDto = z.infer<typeof StartRouteSchema>;

// Driver taps "Pickup Complete" at a dock
export const PickupCompleteSchema = z.object({
  segmentId: z.string().min(1),
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type PickupCompleteDto = z.infer<typeof PickupCompleteSchema>;

// Driver taps "Delivery Complete" at a dock
export const DeliveryCompleteSchema = z.object({
  segmentId: z.string().min(1),
  notes: z.string().max(500).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type DeliveryCompleteDto = z.infer<typeof DeliveryCompleteSchema>;

// Dispatcher overrides a segment status
export const DispatcherOverrideSchema = z.object({
  segmentId: z.string().min(1),
  newStatus: z.enum(['in_progress', 'completed', 'skipped']),
  reason: z.string().min(1).max(500),
  // For confirming business events on driver's behalf
  confirmPickup: z.boolean().optional(),
  confirmDelivery: z.boolean().optional(),
});
export type DispatcherOverrideDto = z.infer<typeof DispatcherOverrideSchema>;
