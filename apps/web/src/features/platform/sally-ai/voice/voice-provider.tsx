'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useVoiceSession } from './use-voice-session';
import { useSallyStore } from '../store';
import { getVoiceStatus } from '../api';
import { getUserPreferences } from '../../settings/api';
import { type VoiceState, type VoiceSessionHookResult } from './types';
import type { ChatMessage } from '../engine/types';

interface VoiceContextValue extends VoiceSessionHookResult {
  toggleVoice: () => Promise<void>;
  isVoiceActive: boolean;
  isVoiceAvailable: boolean;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function VoiceProvider({ children }: { children: ReactNode }) {
  const store = useSallyStore();
  const { sessionId, setOrbState, setActiveTranscript, userMode } = store;
  const [isVoiceAvailable, setIsVoiceAvailable] = useState(false);
  const setVoicePrefs = useSallyStore((s) => s.setVoicePrefs);

  const assistantMsgIdRef = useRef<string | null>(null);
  const pendingUserTranscriptRef = useRef<string>('');

  // Fetch voice status and preferences on mount
  useEffect(() => {
    if (userMode === 'prospect') {
      setIsVoiceAvailable(false);
      return;
    }
    getVoiceStatus()
      .then((status) => setIsVoiceAvailable(status.available))
      .catch(() => setIsVoiceAvailable(false));

    getUserPreferences()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((prefs: any) => {
        if (prefs) {
          setVoicePrefs({
            voiceMode: prefs.voiceMode || 'manual',
            voiceId: prefs.voiceId || 'warm',
            voiceSpeed: prefs.voiceSpeed || 'normal',
          });
        }
      })
      .catch(() => {
        /* use defaults */
      });
  }, [userMode, setVoicePrefs]);

  const resetVoiceTurnState = useCallback(() => {
    assistantMsgIdRef.current = null;
    pendingUserTranscriptRef.current = '';
    setActiveTranscript('');
  }, [setActiveTranscript]);

  const voiceSession = useVoiceSession({
    onStateChange: (state: VoiceState) => {
      switch (state) {
        case 'listening':
          setOrbState('listening');
          break;
        case 'processing':
          setOrbState('thinking');
          // Add user message to chat immediately so user sees their input was received
          if (pendingUserTranscriptRef.current) {
            const userMsg: ChatMessage = {
              id: `voice-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              role: 'user',
              content: pendingUserTranscriptRef.current,
              inputMode: 'voice',
              timestamp: new Date(),
            };
            pendingUserTranscriptRef.current = '';
            setActiveTranscript('');
            useSallyStore.setState((s) => ({
              messages: [...s.messages, userMsg],
            }));
          }
          break;
        case 'speaking':
          setOrbState('speaking');
          break;
        default:
          resetVoiceTurnState();
          setOrbState('idle');
      }
    },

    // User transcript — show live preview, add to chat on final
    onUserTranscript: (text: string) => {
      // Finalize any previous assistant message
      if (assistantMsgIdRef.current) {
        assistantMsgIdRef.current = null;
      }
      setActiveTranscript(text);
      pendingUserTranscriptRef.current = text;
    },

    // Assistant text chunk — create placeholder or append
    onAssistantTranscript: (text: string) => {
      // First chunk: create assistant placeholder
      if (!assistantMsgIdRef.current) {
        // If user message wasn't added yet (edge case), add it now
        const newMessages: ChatMessage[] = [];
        if (pendingUserTranscriptRef.current) {
          newMessages.push({
            id: `voice-user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            role: 'user',
            content: pendingUserTranscriptRef.current,
            inputMode: 'voice',
            timestamp: new Date(),
          });
          pendingUserTranscriptRef.current = '';
          setActiveTranscript('');
        }

        const assistantId = `voice-assistant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        assistantMsgIdRef.current = assistantId;
        newMessages.push({
          id: assistantId,
          role: 'assistant',
          content: text,
          inputMode: 'voice',
          timestamp: new Date(),
        });

        useSallyStore.setState((s) => ({
          messages: [...s.messages, ...newMessages],
        }));
        return;
      }

      // Subsequent chunks — append to existing assistant message
      useSallyStore.setState((s) => ({
        messages: s.messages.map((m) => (m.id === assistantMsgIdRef.current ? { ...m, content: m.content + text } : m)),
      }));
    },

    onAssistantComplete: () => {
      assistantMsgIdRef.current = null;
      setOrbState('listening');
    },
  });

  const toggleVoice = useCallback(async () => {
    if (voiceSession.voiceState !== 'idle') {
      voiceSession.disconnect();
      return;
    }

    // Lazily initialize the conversation if needed — the home idle state
    // doesn't have a session until the user first interacts. Without this,
    // the mic on home was a silent no-op.
    let conversationId = sessionId;
    if (!conversationId) {
      await useSallyStore.getState().initSession();
      conversationId = useSallyStore.getState().sessionId;
    }
    if (!conversationId) {
      // eslint-disable-next-line no-console
      console.warn('[Voice] Unable to initialize conversation — voice cannot start');
      return;
    }
    voiceSession.connect({ conversationId });
  }, [voiceSession, sessionId]);

  const isVoiceActive = voiceSession.voiceState !== 'idle';

  return (
    <VoiceContext.Provider
      value={{
        ...voiceSession,
        toggleVoice,
        isVoiceActive,
        isVoiceAvailable,
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice(): VoiceContextValue {
  const ctx = useContext(VoiceContext);
  if (!ctx) {
    throw new Error('useVoice must be used within VoiceProvider');
  }
  return ctx;
}
