import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ExchangeRemovalResolutionSchema, type ExchangeRemovalResolution } from '@sally/shared-types';

const RESOLUTION_OPTIONS = ExchangeRemovalResolutionSchema.options;

/**
 * Query payload for `DELETE /loads/:loadId/exchanges/:stopId`.
 *
 * The endpoint infers `delete` vs `revert` from existing data. The caller only
 * supplies `resolve` on the *retry* after the endpoint returned 409 because the
 * inference was genuinely ambiguous.
 */
export class RemoveExchangeQueryDto {
  @ApiPropertyOptional({
    enum: RESOLUTION_OPTIONS,
    description:
      'Force a specific resolution. Only supply when retrying after a 409 ambiguous response — leave undefined to let the server infer.',
  })
  @IsOptional()
  @IsIn(RESOLUTION_OPTIONS)
  resolve?: ExchangeRemovalResolution;
}
