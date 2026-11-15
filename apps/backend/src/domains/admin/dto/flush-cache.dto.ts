import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/** `POST /admin/cache/flush` — `{ "confirm": true }` is required to flush every cache key. */
export class FlushCacheDto {
  @ApiPropertyOptional({ description: 'Must be true: a guard against an accidental flush of every cache.' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}
