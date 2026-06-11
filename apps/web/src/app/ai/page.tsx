'use client';

import { useEffect } from 'react';
import { AssistantChat, useAssistantStore } from '@/features/platform/ai-chat';
import { VoiceProvider } from '@/features/platform/ai-chat/voice/voice-provider';

/**
 * Full-page AI Assistant — the default post-login surface.
 *
 * Mounts the same chat engine as the floating AssistantStrip (they share the
 * assistant store, so the conversation is the same in both) in an immersive
 * layout. The "AI Assistant" sidebar item and getDefaultRouteForRole land
 * here.
 */
export default function AIAssistantPage() {
  const initSession = useAssistantStore((s) => s.initSession);
  const userMode = useAssistantStore((s) => s.userMode);

  // Create (or reuse) the conversation session on mount. Re-runs when the
  // user mode resolves (AppAIProvider syncs it from the auth store, which
  // also clears any session created under a previous mode).
  useEffect(() => {
    void initSession();
  }, [initSession, userMode]);

  // Counteract AppLayout's PageTransition padding (p-4 md:p-8) and fill the
  // viewport below the 3.5rem app header.
  return (
    <div className="-m-4 md:-m-8 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 3.5rem)' }}>
      <div className="flex-1 flex flex-col min-h-0 max-w-4xl mx-auto w-full">
        <VoiceProvider>
          <AssistantChat embedded />
        </VoiceProvider>
      </div>
    </div>
  );
}
