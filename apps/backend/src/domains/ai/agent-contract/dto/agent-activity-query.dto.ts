import {
  AgentActivityFilterSchema,
  AgentPrincipalKindSchema,
  type AgentActivityFilter,
  type AgentPrincipalKind,
} from '@app/shared-types';
import { fieldError } from '@appshore/kernel/shared/errors/api-errors';
import { parseSingleValue } from '@appshore/kernel/shared/utils/list-query';
import { CursorQueryDto, QueryParam } from '@appshore/kernel/shared/utils/query-dto';
import { QueryCalendarDate } from '../../../../shared/dto/query-date-text';

const PRINCIPAL_KINDS = AgentPrincipalKindSchema.options;
const FILTERS = AgentActivityFilterSchema.options;

/**
 * `GET /agent-activity` — `principal_kind` + `principal_id` (required), `filter` (default `all`), `cursor`,
 * `limit` (1…100, default 50), `date_from` / `date_to` (YYYY-MM-DD, tenant-local).
 */
export class AgentActivityQueryDto extends CursorQueryDto {
  @QueryParam(
    (raw, wire) => {
      const kind = parseSingleValue(raw, wire);
      if (!kind || !PRINCIPAL_KINDS.includes(kind as AgentPrincipalKind)) {
        throw fieldError(wire, `Pick one of: ${PRINCIPAL_KINDS.join(', ')}`);
      }
      return kind as AgentPrincipalKind;
    },
    { name: 'principal_kind' },
    { type: String, enum: [...PRINCIPAL_KINDS] },
  )
  principalKind!: AgentPrincipalKind;

  @QueryParam(
    (raw, wire) => {
      const id = parseSingleValue(raw, wire);
      if (!id) throw fieldError(wire, 'principal_id is required');
      return id;
    },
    { name: 'principal_id' },
  )
  principalId!: string;

  @QueryParam(
    (raw, wire) => {
      const filter = parseSingleValue(raw, wire) ?? 'all';
      if (!FILTERS.includes(filter as AgentActivityFilter)) {
        throw fieldError(wire, `Pick one of: ${FILTERS.join(', ')}`);
      }
      return filter as AgentActivityFilter;
    },
    {},
    { type: String, enum: [...FILTERS], default: 'all' },
  )
  filter!: AgentActivityFilter;

  @QueryCalendarDate('date_from')
  dateFrom?: string;

  @QueryCalendarDate('date_to')
  dateTo?: string;
}
