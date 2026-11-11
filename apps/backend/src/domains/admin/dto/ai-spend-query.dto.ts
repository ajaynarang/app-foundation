import type { AiSurface } from '@appshore/db';
import { AiSurfaceSchema } from '@app/shared-types';
import { CursorQueryDto, QueryEnum, QueryInt } from '@appshore/kernel/shared/utils/query-dto';

/**
 * The `?days=` window: a whole number clamped to 1…90 (a runaway 365-day scan is pulled back, never refused).
 * `abc` is a 400.
 */
const AiSpendDays = (fallback: number) => QueryInt({ min: 1, max: 90, clamp: true, default: fallback });

/** `GET /admin/ai-spend/tenants` and `…/tenants/:tenant_id/by-surface` — `days` (1…90, default 7). */
export class AiSpendWindowQueryDto {
  @AiSpendDays(7)
  days!: number;
}

/** `GET /admin/ai-spend/tenants/:tenant_id/cost-vs-quota` — `days` (1…90, default 30). */
export class AiSpendQuotaWindowQueryDto {
  @AiSpendDays(30)
  days!: number;
}

/** `GET /admin/ai-spend/tenants/:tenant_id/invocations` — `limit` (1…100, default 50), `cursor`, `surface`. */
export class AiSpendInvocationListQueryDto extends CursorQueryDto {
  @QueryEnum(AiSurfaceSchema.options)
  surface?: AiSurface;
}
