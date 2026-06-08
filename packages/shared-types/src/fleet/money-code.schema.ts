import { z } from 'zod';
import {
  MoneyCodeMethod,
  MoneyCodeMethodSchema,
  MoneyCodeStatus,
  MoneyCodeStatusSchema,
} from '../generated/prisma-enums';

// `MoneyCodeMethod` and `MoneyCodeStatus` re-exported from the codegen mirror.
export { MoneyCodeMethod, MoneyCodeMethodSchema, MoneyCodeStatus, MoneyCodeStatusSchema };

// Const-array exports retained for legacy DTO consumers (e.g. NestJS `@IsIn`)
// which need a plain string array, not a Zod schema.
export const MONEY_CODE_METHODS = MoneyCodeMethodSchema.options;
export const MONEY_CODE_STATUSES = MoneyCodeStatusSchema.options;

export const CreateMoneyCodeSchema = z.object({
  stopId: z.number().int().optional(),
  requestedCents: z.number().int().min(100).max(9999999),
  method: MoneyCodeMethodSchema,
  driverNote: z.string().max(500).optional(),
});

export const ApproveMoneyCodeSchema = z.object({
  code: z.string().min(1).max(50),
  amountCents: z.number().int().min(100).max(9999999),
  dispatcherNote: z.string().max(500).optional(),
  expiresInHours: z.number().int().min(1).max(168).default(24),
});

export const MoneyCodeSchema = z.object({
  id: z.number(),
  moneyCodeId: z.string(),
  loadId: z.number(),
  stopId: z.number().nullable(),
  driverId: z.number(),
  code: z.string().nullable(),
  amountCents: z.number(),
  requestedCents: z.number(),
  method: MoneyCodeMethodSchema,
  status: MoneyCodeStatusSchema,
  requestedAt: z.string(),
  approvedAt: z.string().nullable(),
  usedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  driverNote: z.string().nullable(),
  dispatcherNote: z.string().nullable(),
  receiptDocumentId: z.number().nullable(),
  loadChargeId: z.number().nullable(),
  createdAt: z.string(),
});

// `MoneyCodeMethod`, `MoneyCodeStatus` types come from codegen mirror.
export type MoneyCode = z.infer<typeof MoneyCodeSchema>;
export type CreateMoneyCode = z.infer<typeof CreateMoneyCodeSchema>;
export type ApproveMoneyCode = z.infer<typeof ApproveMoneyCodeSchema>;
