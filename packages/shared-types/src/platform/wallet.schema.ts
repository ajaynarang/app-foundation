import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const WalletTransactionTypeEnum = z.enum([
  'TOP_UP',
  'OVERAGE_DEDUCTION',
  'ADMIN_CREDIT',
  'REFUND',
  'AUTO_RELOAD',
]);

// ---------------------------------------------------------------------------
// Core schemas
// ---------------------------------------------------------------------------
export const WalletSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  balanceCents: z.number(),
  autoReloadEnabled: z.boolean(),
  autoReloadThresholdCents: z.number().nullable(),
  autoReloadAmountCents: z.number().nullable(),
  lifetimeLoadedCents: z.number(),
  lifetimeConsumedCents: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const WalletTransactionSchema = z.object({
  id: z.string(),
  walletId: z.string(),
  tenantId: z.string(),
  type: WalletTransactionTypeEnum,
  amountCents: z.number(),
  balanceAfterCents: z.number(),
  description: z.string(),
  relatedAddOnId: z.string().nullable(),
  providerPaymentId: z.string().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
});

// ---------------------------------------------------------------------------
// Request schemas
// ---------------------------------------------------------------------------
export const TopUpRequestSchema = z.object({
  amountCents: z.number().min(100),
});

export const AutoReloadSettingsSchema = z.object({
  enabled: z.boolean(),
  thresholdCents: z.number().min(0).optional(),
  reloadAmountCents: z.number().min(500).optional(),
});

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------
export const WalletBalanceResponseSchema = z.object({
  wallet: WalletSchema,
  recentTransactions: z.array(WalletTransactionSchema),
});

export const WalletTransactionListResponseSchema = z.object({
  items: z.array(WalletTransactionSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type WalletTransactionType = z.infer<typeof WalletTransactionTypeEnum>;
export type Wallet = z.infer<typeof WalletSchema>;
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>;
export type TopUpRequest = z.infer<typeof TopUpRequestSchema>;
export type AutoReloadSettings = z.infer<typeof AutoReloadSettingsSchema>;
export type WalletBalanceResponse = z.infer<typeof WalletBalanceResponseSchema>;
export type WalletTransactionListResponse = z.infer<typeof WalletTransactionListResponseSchema>;
