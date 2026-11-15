'use client';

import { useParams } from 'next/navigation';
import { AgentActionReview } from '@/features/platform/agent-actions';

/**
 * `/agent-actions/:token/approve`: where an external agent's approval link lands. Signed-in only (middleware); the
 * API decides who may see and decide. Serves both kinds: Approve or Deny for a standard write, the PIN for a
 * sensitive one.
 */
export default function AgentActionApprovePage() {
  const { token } = useParams<{ token: string }>();
  return <AgentActionReview token={token} />;
}
