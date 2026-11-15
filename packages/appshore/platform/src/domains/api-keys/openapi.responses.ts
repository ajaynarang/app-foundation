import { ApiProperty } from '@nestjs/swagger';
import { ApiKeyDto } from './dto/api-key.dto';
import { TenantApiKeyListItemDto } from './dto/list-api-keys.dto';

/** `POST /api-keys/:api_key_id/rotate`: the replacement key and its plaintext, shown once. */
export class ApiKeyRotation {
  @ApiProperty({ type: ApiKeyDto, description: 'The new key row (its `key` field is not set: read `plaintextKey`)' })
  apiKey: ApiKeyDto;

  @ApiProperty({ description: 'The new key in plaintext, returned only on this response' })
  plaintextKey: string;
}

/** The cursor-list envelope, for the DTO-class lists of this domain. */
class CursorPage {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Pass back as `?cursor=` for the next page; null on the last',
  })
  nextCursor: string | null;

  @ApiProperty({ minimum: 0, description: 'Rows matching the current view' })
  total: number;
}

/** `GET /api-keys`: one page of the current user's keys. */
export class ApiKeyList extends CursorPage {
  @ApiProperty({ type: [ApiKeyDto] })
  items: ApiKeyDto[];
}

/** `GET /api-keys/admin/tenant`: one page of every key in the tenant. */
export class TenantApiKeyList extends CursorPage {
  @ApiProperty({ type: [TenantApiKeyListItemDto] })
  items: TenantApiKeyListItemDto[];
}
