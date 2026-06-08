/**
 * Login activity types.
 *
 * Domain types come from @sally/shared-types (Prisma-enum mirrors + Zod schemas).
 * The frontend never redefines these — it only adds UI-only types here.
 */

export type {
  LoginActivityEvent,
  ListLoginActivityQuery,
  LoginActivitySummaryQuery,
  LoginActivitySummary,
  ListLoginActivityResponse,
  LoginEventStatus,
  LoginFailReason,
} from '@sally/shared-types';

/** UI-only: which API namespace the hook should hit. */
export type LoginActivityScope = 'tenant' | 'super';
