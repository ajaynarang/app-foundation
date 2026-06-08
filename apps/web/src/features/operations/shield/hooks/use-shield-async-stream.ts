'use client';

import { SSE_EVENTS } from '@sally/shared-types';
import { useSseEvent } from '@/shared/realtime';
import { useSallyStore } from '@/features/platform/sally-ai/store';

/**
 * When a Shield audit kicked off from inside a Sally chat completes,
 * inject the result card into that same conversation so the user sees
 * it inline. No-op if the audit didn't originate from a chat or the
 * conversation is no longer active.
 */
export function useShieldAsyncStream(): void {
  useSseEvent(SSE_EVENTS.SHIELD_AUDIT_COMPLETE, (data) => {
    if (!data.asyncFollowUp || !data.conversationId) return;

    const store = useSallyStore.getState();
    if (store.sessionId !== data.conversationId) return;

    const asyncMsg = {
      id: `async-shield-${Date.now()}`,
      role: 'assistant' as const,
      content: `**Shield Audit Complete — Score: ${data.overallScore}/100 (${data.statusLabel})**\n\n📊 ${data.findingsCount} findings found. View the full report in the Shield dashboard.`,
      inputMode: 'text' as const,
      timestamp: new Date(),
      card: {
        type: 'shield' as const,
        data: {
          auditId: data.auditId,
          overallScore: data.overallScore,
          statusLabel: data.statusLabel,
          findingsCount: data.findingsCount,
        },
      },
    };

    useSallyStore.setState((s) => ({
      messages: [...s.messages, asyncMsg],
      hasUnreadAsync: !s.isExpanded,
    }));
  });
}
