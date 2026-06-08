import { z } from 'zod';

export const DRIVER_ACTION_TYPES = ['detention', 'scale_ticket', 'fuel_receipt', 'issue_report'] as const;
export const ACTION_REQUEST_STATUSES = ['SUBMITTED', 'ACKNOWLEDGED', 'RESOLVED'] as const;

export const DriverActionTypeSchema = z.enum(DRIVER_ACTION_TYPES);
export const ActionRequestStatusSchema = z.enum(ACTION_REQUEST_STATUSES);

export const CreateDriverActionSchema = z.object({
  stopId: z.number().int().optional(),
  actionType: DriverActionTypeSchema,
  note: z.string().max(500).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const DriverActionRequestSchema = z.object({
  id: z.number(),
  actionRequestId: z.string(),
  loadId: z.number(),
  stopId: z.number().nullable(),
  driverId: z.number(),
  actionType: DriverActionTypeSchema,
  status: ActionRequestStatusSchema,
  note: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  documentId: z.number().nullable(),
  loadChargeId: z.number().nullable(),
  acknowledgedAt: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  createdAt: z.string(),
});

export type DriverActionType = z.infer<typeof DriverActionTypeSchema>;
export type ActionRequestStatus = z.infer<typeof ActionRequestStatusSchema>;
export type DriverActionRequest = z.infer<typeof DriverActionRequestSchema>;
export type CreateDriverAction = z.infer<typeof CreateDriverActionSchema>;
