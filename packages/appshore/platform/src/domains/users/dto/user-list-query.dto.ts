import { ListQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import type { UserListQuery } from '../users.service';

/** `GET /users` — `limit`, `cursor`, `q` (email or name). */
export class UserListQueryDto extends ListQueryDto implements UserListQuery {}
