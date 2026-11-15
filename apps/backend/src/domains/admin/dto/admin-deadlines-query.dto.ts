import {
  DEADLINE_LIST_SORTS,
  DEADLINE_STATES,
  DEFAULT_DEADLINE_LIST_SORT,
  type DeadlineListSort,
  type DeadlineState,
} from '@app/shared-types';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { hasControlCharacters, parseSingleValue, type RawQueryValue } from '@appshore/kernel/shared/utils/list-query';
import { CursorQueryDto, QueryEnumList, QueryParam, QuerySort } from '@appshore/kernel/shared/utils/query-dto';
import type { DeadlineListQuery } from '@appshore/platform/infrastructure/deadlines/deadline.service';

/** `kind` and the tenant slug are stored as VarChar(60) / VarChar(50); anything longer matches nothing. */
const MAX_FILTER_LENGTH = 100;

/** An exact-match filter value: one value, trimmed, no control characters (they would fail in the query). */
function parseFilter(raw: RawQueryValue, wire: string): string | undefined {
  const value = parseSingleValue(raw, wire)?.trim();
  if (!value) return undefined;
  if (value.length > MAX_FILTER_LENGTH || hasControlCharacters(value)) {
    throw fieldError(wire, `The ${wire} filter is not valid`);
  }
  return value;
}

/** `GET /admin/deadlines` — `state`, `kind`, `tenant` (slug), `sort` (soonest | latest), `limit`, `cursor`. */
export class AdminDeadlineListQueryDto extends CursorQueryDto implements DeadlineListQuery {
  /** Comma-joined (or repeated) deadline states. */
  @QueryEnumList(DEADLINE_STATES, { name: 'state' })
  states?: DeadlineState[];

  @QueryParam(parseFilter)
  kind?: string;

  @QueryParam(parseFilter)
  tenant?: string;

  @QuerySort(DEADLINE_LIST_SORTS, DEFAULT_DEADLINE_LIST_SORT)
  sort!: DeadlineListSort;
}
