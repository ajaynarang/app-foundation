import { AgentActionStatusSchema, type AgentActionStatus } from '@app/shared-types';
import type { StatusVariant } from '@app/ui';

const STATUS = AgentActionStatusSchema.enum;

/** One label and tone per request status. */
export const AGENT_ACTION_STATUS_VARIANTS: Record<AgentActionStatus, StatusVariant> = {
  [STATUS.PENDING]: { label: 'Pending approval', tone: 'warning' },
  [STATUS.APPROVED]: { label: 'Approved', tone: 'success' },
  [STATUS.DENIED]: { label: 'Denied', tone: 'danger' },
  [STATUS.EXPIRED]: { label: 'Expired', tone: 'muted' },
  [STATUS.USED]: { label: 'Done', tone: 'success' },
};

/** Why a request can no longer be decided, shown in place of the buttons. */
export const AGENT_ACTION_CLOSED_COPY: Record<Exclude<AgentActionStatus, 'PENDING'>, string> = {
  [STATUS.APPROVED]: 'Approved. The agent can run it once, with exactly these details.',
  [STATUS.DENIED]: 'Denied. The agent cannot run it.',
  [STATUS.EXPIRED]: 'This request expired before anyone decided. The agent can ask again.',
  [STATUS.USED]: 'The agent ran this request.',
};

/** Where a person with no PIN sets one: the profile page's PIN section. */
export const PROFILE_PIN_PATH = '/settings/profile';
