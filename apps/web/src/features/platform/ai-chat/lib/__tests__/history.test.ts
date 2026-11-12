import { groupConversationsByRecency } from '../history';
import type { ConversationSummary } from '@app/shared-types';

const conv = (id: string, lastMessageAt: string): ConversationSummary => ({
  conversationId: id,
  userMode: 'member',
  title: id,
  messageCount: 2,
  lastMessageAt,
  createdAt: lastMessageAt,
});

// Fixed "now" mid-afternoon local time so day boundaries are unambiguous.
const NOW = new Date(2026, 6, 8, 15, 0, 0);

describe('groupConversationsByRecency', () => {
  it('buckets by today / yesterday / this week / earlier', () => {
    const groups = groupConversationsByRecency(
      [
        conv('a', new Date(2026, 6, 8, 9).toISOString()),
        conv('b', new Date(2026, 6, 7, 22).toISOString()),
        conv('c', new Date(2026, 6, 3, 10).toISOString()),
        conv('d', new Date(2026, 5, 20, 10).toISOString()),
      ],
      NOW,
    );

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'This week', 'Earlier']);
    expect(groups[0].conversations[0].conversationId).toBe('a');
    expect(groups[3].conversations[0].conversationId).toBe('d');
  });

  it('omits empty groups', () => {
    const groups = groupConversationsByRecency([conv('a', new Date(2026, 6, 8, 9).toISOString())], NOW);

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Today');
  });

  it('preserves input order within a group', () => {
    const groups = groupConversationsByRecency(
      [conv('first', new Date(2026, 6, 8, 12).toISOString()), conv('second', new Date(2026, 6, 8, 9).toISOString())],
      NOW,
    );

    expect(groups[0].conversations.map((c) => c.conversationId)).toEqual(['first', 'second']);
  });

  it('returns an empty array for no conversations', () => {
    expect(groupConversationsByRecency([], NOW)).toEqual([]);
  });
});
