import { QueryEnum } from '@appshore/kernel/shared/utils/query-dto';
import { AGENT_ACTIVITY_WINDOWS, type AgentActivityWindow } from '../../types';

/** `GET /desk/agents/:key/activity` — `window` (24h | 7d | 30d; default 7d in the controller). */
export class AgentActivityWindowQueryDto {
  @QueryEnum(AGENT_ACTIVITY_WINDOWS)
  window?: AgentActivityWindow;
}
