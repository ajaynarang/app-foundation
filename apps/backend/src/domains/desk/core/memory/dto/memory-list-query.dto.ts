import { parseEnumValue } from '@appshore/kernel/shared/utils/list-query';
import { QueryBool, QueryEnum, QueryLimit, QueryParam, QueryString } from '@appshore/kernel/shared/utils/query-dto';
import {
  MemoryPolaritySchema,
  MemoryScopeSchema,
  type ListMemoriesQuery,
  type MemoryPolarity,
  type MemoryScope,
} from '../../types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /desk/memories` — `agent_key`, `scope`, `polarity`, `authored_by_operator_only` (true | false),
 * `source_episode_id` (uuid), `active_only` (true | false; default true), `limit` (1…200, default 50).
 */
export class MemoryListQueryDto implements ListMemoriesQuery {
  @QueryString({ name: 'agent_key' })
  agentKey?: string;

  @QueryEnum(MemoryScopeSchema.options)
  scope?: MemoryScope;

  @QueryEnum(MemoryPolaritySchema.options)
  polarity?: MemoryPolarity;

  /** The Rules tab (`true`) or the Memory tab (`false`); omitted: both. */
  @QueryBool({ name: 'authored_by_operator_only' })
  authoredByOperatorOnly?: boolean;

  @QueryString({ name: 'source_episode_id', pattern: UUID, message: '"source_episode_id" must be a UUID' })
  sourceEpisodeId?: string;

  /** `true` / `false` only; omitted: `true` (inactive memories stay hidden unless asked for). */
  @QueryParam(
    (raw, wire) => parseEnumValue<'true' | 'false'>(raw, ['true', 'false'], wire) !== 'false',
    { name: 'active_only' },
    { type: Boolean, default: true },
  )
  activeOnly!: boolean;

  @QueryLimit({ max: 200, default: 50 })
  limit!: number;
}
