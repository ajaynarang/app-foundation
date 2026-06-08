'use client';

import { useCallback, useEffect } from 'react';
import { useRouter } from '@bprogress/next/app';
import { AnimatePresence } from 'framer-motion';
import { useSallyStore } from '@/features/platform/sally-ai/store';
import { VoidIdle } from './VoidIdle';
import { VoidChat } from './VoidChat';

/**
 * SallyHome — the primary home page component ("The Void").
 *
 * Two visual states driven by the Sally store:
 * - **Idle** — orb, greeting, pulse strip, smart input, activity feed
 * - **Chat** — full-screen SallyChat (same component as floating panel, immersive layout)
 *
 * The transition triggers when `messages.length > 1` (more than the greeting).
 * Chat renders INLINE — NOT in the floating SallyStrip panel.
 *
 * The floating Sally orb is hidden on this page to avoid two competing
 * chat entry points. Users interact via the home input (idle) or the
 * inline chat (active).
 */
export function SallyHome() {
  const router = useRouter();
  const messages = useSallyStore((s) => s.messages);
  const sessionId = useSallyStore((s) => s.sessionId);
  const initSession = useSallyStore((s) => s.initSession);
  const clearSession = useSallyStore((s) => s.clearSession);
  const clearView = useSallyStore((s) => s.clearView);
  const loadHistory = useSallyStore((s) => s.loadHistory);
  const userMode = useSallyStore((s) => s.userMode);
  const isViewingHistory = useSallyStore((s) => s.isViewingHistory);

  // Inline chat is active when the store has a real conversation OR
  // the user is viewing a past conversation. Either way, the home flips
  // from idle to the inline VoidChat surface — no floating panel ever opens here.
  const isInChat = messages.length > 1 || isViewingHistory;

  // Load conversation history on mount
  useEffect(() => {
    if (userMode !== 'prospect') {
      loadHistory();
    }
  }, [userMode, loadHistory]);

  const handleEnterChat = useCallback(
    async (message: string) => {
      // Initialize session if needed (clean — no floating panel side effects)
      if (!sessionId) {
        await initSession();
      }
      // Session is now ready — send the message
      // (use getState to get the latest sendMessage after session init)
      useSallyStore.getState().sendMessage(message, 'text');
    },
    [sessionId, initSession],
  );

  const handleNavigate = useCallback(
    (href: string) => {
      router.push(href);
    },
    [router],
  );

  const handleReset = useCallback(() => {
    // Reset both branches of `isInChat` so we always return to idle,
    // whether the user was in an active session or just viewing history.
    if (isViewingHistory) clearView();
    clearSession();
  }, [clearSession, clearView, isViewingHistory]);

  return (
    <AnimatePresence mode="wait">
      {isInChat ? (
        <VoidChat key="chat" onReset={handleReset} />
      ) : (
        <VoidIdle key="idle" onEnterChat={handleEnterChat} onNavigate={handleNavigate} />
      )}
    </AnimatePresence>
  );
}
