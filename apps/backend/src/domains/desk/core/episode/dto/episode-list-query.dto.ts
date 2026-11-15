import { z } from 'zod';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { parseSingleValue } from '@appshore/kernel/shared/utils/list-query';
import {
  CursorQueryDto,
  QueryEnum,
  QueryParam,
  QuerySearch,
  QueryString,
} from '@appshore/kernel/shared/utils/query-dto';
import {
  APPROVAL_SCOPES,
  EPISODE_STATUSES,
  HandledWindowSchema,
  type ApprovalScope,
  type EpisodeStatus,
  type HandledWindow,
  type ListDeskEpisodesQuery,
  type ListHandledEpisodesQuery,
} from '../../types';

const ISO_DATETIME = z.string().datetime();

/**
 * A `window=custom` bound: an ISO-8601 instant (`2026-04-01T00:00:00.000Z`), kept as the string. The service
 * reads it in the tenant's timezone.
 */
const QueryInstant = () =>
  QueryParam((raw, wire) => {
    const value = parseSingleValue(raw, wire);
    if (value === undefined) return undefined;
    if (!ISO_DATETIME.safeParse(value).success) throw fieldError(wire, `"${wire}" must be an ISO-8601 date-time`);
    return value;
  });

/** `GET /desk/episodes` — `status`, `scope` (mine | all; default by role), `limit` (1…100, default 50), `cursor`. */
export class DeskEpisodeListQueryDto extends CursorQueryDto implements ListDeskEpisodesQuery {
  @QueryEnum(EPISODE_STATUSES)
  status?: EpisodeStatus;

  @QueryEnum(APPROVAL_SCOPES)
  scope?: ApprovalScope;
}

/**
 * `GET /desk/episodes/handled` — `scope`, `window` (today | 7d | 30d | this_month | custom), `from` / `to`
 * (ISO instants, for `custom`), `agent`, `outcome`, `q`, `limit` (1…100, default 50), `cursor`.
 */
export class HandledEpisodeListQueryDto extends CursorQueryDto implements ListHandledEpisodesQuery {
  @QueryEnum(APPROVAL_SCOPES)
  scope?: ApprovalScope;

  @QueryEnum(HandledWindowSchema.options)
  window?: HandledWindow;

  @QueryInstant()
  from?: string;

  @QueryInstant()
  to?: string;

  /** Agent key. */
  @QueryString()
  agent?: string;

  @QueryString()
  outcome?: string;

  @QuerySearch()
  q?: string;
}
