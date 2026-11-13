import type { ConversationSummary } from '@app/shared-types';

export type HistoryGroupLabel = 'Today' | 'Yesterday' | 'This week' | 'Earlier';

export interface HistoryGroup {
  label: HistoryGroupLabel;
  conversations: ConversationSummary[];
}

const GROUP_ORDER: HistoryGroupLabel[] = ['Today', 'Yesterday', 'This week', 'Earlier'];
const DAY_MS = 24 * 60 * 60 * 1000;

function labelFor(lastMessageAt: string, now: Date): HistoryGroupLabel {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const at = new Date(lastMessageAt);
  if (at >= startOfToday) return 'Today';
  if (at >= new Date(startOfToday.getTime() - DAY_MS)) return 'Yesterday';
  if (at >= new Date(startOfToday.getTime() - 6 * DAY_MS)) return 'This week';
  return 'Earlier';
}

/** Bucket conversations into recency groups, newest group first, empty groups omitted. */
export function groupConversationsByRecency(
  conversations: ConversationSummary[],
  now: Date = new Date(),
): HistoryGroup[] {
  const buckets = new Map<HistoryGroupLabel, ConversationSummary[]>();
  for (const conversation of conversations) {
    const label = labelFor(conversation.lastMessageAt, now);
    const bucket = buckets.get(label) ?? [];
    bucket.push(conversation);
    buckets.set(label, bucket);
  }
  return GROUP_ORDER.filter((label) => buckets.has(label)).map((label) => ({
    label,
    conversations: buckets.get(label)!,
  }));
}
