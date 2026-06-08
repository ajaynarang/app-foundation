import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import type { SetMemoryPinnedRequest } from '@sally/shared-types';

export class SetMemoryPinnedDto implements SetMemoryPinnedRequest {
  @ApiProperty({ description: 'Pin (true) or unpin (false). Pinned memories skip auto-decay.' })
  @IsBoolean()
  isPinned!: boolean;
}
