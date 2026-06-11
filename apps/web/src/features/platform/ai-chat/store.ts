import { create } from 'zustand';
import { STORAGE_KEYS } from '@/shared/constants';
import type { ChatMessage, OrbState, UserMode, InputMode, Intent, ChatLayout } from './engine/types';
import { DEFAULT_VOICE_PREFS, type VoicePreferences } from './voice/types';
import {
  createConversation as createConversationApi,
  listConversations,
  getConversationMessages,
  getStreamingUrl,
  getResumeUrl,
  getAuthHeaders,
  type ConversationSummary,
} from './api';

/** Pending HITL confirmation from the agent. */
interface PendingConfirmation {
  action: string;
  description: string;
  entityId: string;
  entityType: string;
  runId?: string;
  toolCallId?: string;
}

interface AssistantState {
  // Strip state
  isOpen: boolean;
  isExpanded: boolean;

  // Session
  sessionId: string | null;
  messages: ChatMessage[];

  // Voice
  orbState: OrbState;
  activeTranscript: string;
  voicePrefs: VoicePreferences;

  // User context
  userMode: UserMode;
  chatLayout: ChatLayout;

  // HITL confirmation
  pendingConfirmation: PendingConfirmation | null;

  // Input draft (prefilled by Ask Assistant buttons)
  draftInput: string | null;

  // Follow-up suggestions from AI
  suggestedFollowUps: string[];

  // Async job follow-up
  hasUnreadAsync: boolean;

  openSource: 'tab' | 'orb' | null;

  // Chat history
  pastConversations: ConversationSummary[];
  isViewingHistory: boolean;
  viewedMessages: ChatMessage[];
  isLoadingHistory: boolean;

  // Actions
  /** Initialize a conversation session without opening the floating panel. */
  initSession: () => Promise<void>;
  toggleStrip: () => void;
  expandStrip: (source?: 'tab' | 'orb') => void;
  collapseStrip: () => void;
  setUserMode: (mode: UserMode) => void;
  setChatLayout: (layout: ChatLayout) => void;
  sendMessage: (
    content: string,
    inputMode: InputMode,
    options?: { promptKey?: string; promptVariables?: Record<string, string> },
  ) => void;
  stopGeneration: () => void;
  confirmAction: () => void;
  cancelAction: () => void;
  setOrbState: (state: OrbState) => void;
  setActiveTranscript: (text: string) => void;
  setVoicePrefs: (prefs: VoicePreferences) => void;
  setDraftInput: (draft: string | null) => void;
  setSuggestedFollowUps: (followUps: string[]) => void;
  setHasUnreadAsync: (hasUnread: boolean) => void;
  clearSession: () => void;
  loadHistory: () => Promise<void>;
  viewConversation: (conversationId: string) => Promise<void>;
  clearView: () => void;
}

async function initConversationViaApi(mode: UserMode): Promise<{ sessionId: string; messages: ChatMessage[] } | null> {
  try {
    const res = await createConversationApi(mode);
    const greeting: ChatMessage = {
      id: res.greeting.messageId,
      role: 'assistant',
      content: res.greeting.content,
      inputMode: 'text',
      timestamp: new Date(res.greeting.createdAt),
      speakText: res.greeting.speakText,
    };
    return { sessionId: res.conversationId, messages: [greeting] };
  } catch {
    return null;
  }
}

function createFallbackGreeting(mode: UserMode): ChatMessage {
  const greetings: Record<UserMode, string> = {
    member: "Hi! I'm your AI assistant. Ask me anything or tell me what you'd like to get done.",
    owner: "Hi! I'm your AI assistant. I can help you across your workspace — what do you need?",
    admin: "Hi! I'm your AI assistant. I can help you manage your workspace. What do you need?",
    super_admin: "Hi! I'm your AI assistant. I can help you across the platform. What do you need?",
  };
  return {
    id: 'initial',
    role: 'assistant',
    content: greetings[mode],
    inputMode: 'text',
    timestamp: new Date(),
    speakText: greetings[mode],
  };
}

/** Module-level abort controller for cancelling in-flight streaming requests */
let activeAbortController: AbortController | null = null;

export const useAssistantStore = create<AssistantState>((set, get) => ({
  // Initial state
  isOpen: false,
  isExpanded: false,
  sessionId: null,
  messages: [],
  orbState: 'idle',
  activeTranscript: '',
  voicePrefs: DEFAULT_VOICE_PREFS,
  userMode: 'member',
  chatLayout:
    (typeof window !== 'undefined' ? (localStorage.getItem(STORAGE_KEYS.APP_CHAT_LAYOUT) as ChatLayout) : null) ||
    'side',
  draftInput: null,
  suggestedFollowUps: [],
  hasUnreadAsync: false,
  openSource: null,
  pastConversations: [],
  pendingConfirmation: null,
  isViewingHistory: false,
  viewedMessages: [],
  isLoadingHistory: false,

  initSession: async () => {
    const state = get();
    if (state.sessionId) return; // Already initialized
    set({ orbState: 'thinking' });
    const result = await initConversationViaApi(state.userMode);
    if (result) {
      set({ sessionId: result.sessionId, messages: result.messages, orbState: 'idle' });
    } else {
      set({
        sessionId: `local-${Date.now()}`,
        messages: [createFallbackGreeting(state.userMode)],
        orbState: 'idle',
      });
    }
  },

  toggleStrip: () => {
    const state = get();
    const nextOpen = !state.isOpen;
    if (nextOpen && !state.sessionId) {
      set({ isOpen: true, isExpanded: true, orbState: 'thinking' });
      initConversationViaApi(state.userMode).then((result) => {
        if (result) {
          set({ sessionId: result.sessionId, messages: result.messages, orbState: 'idle' });
        } else {
          set({
            sessionId: `local-${Date.now()}`,
            messages: [createFallbackGreeting(state.userMode)],
            orbState: 'idle',
          });
        }
      });
      return;
    }
    set({ isOpen: nextOpen, isExpanded: nextOpen ? state.isExpanded : false });
  },

  expandStrip: (source?: 'tab' | 'orb') => {
    const state = get();
    if (!state.sessionId) {
      set({ isExpanded: true, isOpen: true, orbState: 'thinking', openSource: source ?? 'orb', hasUnreadAsync: false });
      initConversationViaApi(state.userMode).then((result) => {
        if (result) {
          set({ sessionId: result.sessionId, messages: result.messages, orbState: 'idle' });
        } else {
          set({
            sessionId: `local-${Date.now()}`,
            messages: [createFallbackGreeting(state.userMode)],
            orbState: 'idle',
          });
        }
      });
      return;
    }
    set({ isExpanded: true, isOpen: true, openSource: source ?? 'orb', hasUnreadAsync: false });
  },

  collapseStrip: () => set({ isExpanded: false }),

  setUserMode: (mode) =>
    set((state) => {
      if (mode === state.userMode) return {};
      return {
        userMode: mode,
        sessionId: null,
        messages: [],
        pastConversations: [],
        isViewingHistory: false,
        viewedMessages: [],
      };
    }),

  setChatLayout: (layout) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.APP_CHAT_LAYOUT, layout);
    }
    set({ chatLayout: layout });
  },

  sendMessage: (content, inputMode, options) => {
    const state = get();
    const sessionId = state.sessionId;
    if (!sessionId) return;

    const hasPromptKey = Boolean(options?.promptKey);

    // Add user message optimistically (skip when a server-side prompt is used —
    // the client-supplied content is empty and the backend resolves the real prompt).
    const userMessage: ChatMessage | null = hasPromptKey
      ? null
      : {
          id: `msg-${Date.now()}`,
          role: 'user',
          content,
          inputMode,
          timestamp: new Date(),
        };

    // Add assistant placeholder
    const assistantPlaceholderId = `msg-${Date.now()}-assistant`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      inputMode: 'text',
      timestamp: new Date(),
    };

    set((s) => ({
      messages: userMessage
        ? [...s.messages, userMessage, assistantPlaceholder]
        : [...s.messages, assistantPlaceholder],
      orbState: 'thinking' as OrbState,
      activeTranscript: '',
      suggestedFollowUps: [],
    }));

    // Abort any in-flight request before starting a new one
    activeAbortController?.abort();
    activeAbortController = new AbortController();
    const { signal } = activeAbortController;

    // Stream from the authenticated conversations endpoint
    const streamUrl = getStreamingUrl(sessionId);

    fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        content,
        inputMode,
        ...(options?.promptKey ? { promptKey: options.promptKey } : {}),
        ...(options?.promptVariables ? { promptVariables: options.promptVariables } : {}),
      }),
      signal,
      credentials: 'include' as RequestCredentials,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let assistantText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // Parse AI SDK v6 SSE streaming protocol
          // Format: data: {"type":"text-delta","id":"0","delta":"text"}\n\n
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? ''; // Keep incomplete last line in buffer

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              try {
                const event = JSON.parse(trimmed.slice(6));
                if (event.type === 'text-delta' && event.delta) {
                  assistantText += event.delta;
                  set((s) => {
                    const msgs = s.messages.map((m) =>
                      m.id === assistantPlaceholderId ? { ...m, content: assistantText } : m,
                    );
                    return { messages: msgs };
                  });
                }
              } catch {
                /* skip malformed chunks */
              }
            } else if (trimmed.startsWith('0:')) {
              // Legacy AI SDK v4/v5 protocol fallback
              try {
                const text = JSON.parse(trimmed.slice(2));
                assistantText += text;
                set((s) => {
                  const msgs = s.messages.map((m) =>
                    m.id === assistantPlaceholderId ? { ...m, content: assistantText } : m,
                  );
                  return { messages: msgs };
                });
              } catch {
                /* skip non-text chunks */
              }
            } else if (trimmed.startsWith('8:')) {
              // Card metadata from tool results
              try {
                const card = JSON.parse(trimmed.slice(2));
                set((s) => {
                  const msgs = s.messages.map((m) => (m.id === assistantPlaceholderId ? { ...m, card } : m));
                  return { messages: msgs };
                });
              } catch {
                /* skip malformed card data */
              }
            } else if (line.startsWith('9:')) {
              // HITL confirmation payload — agent is suspended, awaiting user decision
              try {
                const payload = JSON.parse(line.slice(2));
                set({
                  pendingConfirmation: payload,
                  orbState: 'idle' as OrbState,
                });
                // Add confirmation card to the chat as a special message
                set((s) => {
                  const confirmMsg: ChatMessage = {
                    id: `confirm-${Date.now()}`,
                    role: 'assistant',
                    content: payload.description,
                    inputMode: 'text',
                    timestamp: new Date(),
                    card: {
                      type: 'confirmation',
                      data: payload,
                    },
                  };
                  return { messages: [...s.messages, confirmMsg] };
                });
              } catch {
                /* skip malformed confirmation */
              }
            } else if (trimmed.startsWith('a:')) {
              // Follow-up suggestions from AI — also strip <followups> XML from visible text
              try {
                const followUps = JSON.parse(trimmed.slice(2));
                if (Array.isArray(followUps)) {
                  // Strip <followups> block from the rendered message text
                  assistantText = assistantText.replace(/<followups>\s*[\s\S]*?<\/followups>\s*$/, '').trimEnd();
                  set((s) => {
                    const msgs = s.messages.map((m) =>
                      m.id === assistantPlaceholderId ? { ...m, content: assistantText } : m,
                    );
                    return { messages: msgs, suggestedFollowUps: followUps };
                  });
                }
              } catch {
                /* skip malformed follow-ups */
              }
            }
          }
        }

        activeAbortController = null;
        set({ orbState: 'idle' as OrbState });
      })
      .catch((err) => {
        activeAbortController = null;
        // Aborted by user — keep partial text, just stop thinking
        if (err instanceof DOMException && err.name === 'AbortError') {
          set({ orbState: 'idle' as OrbState });
          return;
        }
        // Show error message on failure
        set((s) => {
          const msgs = s.messages.map((m) =>
            m.id === assistantPlaceholderId
              ? {
                  ...m,
                  content: "I'm having trouble connecting right now. Please try again in a moment.",
                }
              : m,
          );
          return { messages: msgs, orbState: 'idle' as OrbState };
        });
      });
  },

  stopGeneration: () => {
    activeAbortController?.abort();
    activeAbortController = null;
    set({ orbState: 'idle' as OrbState });
  },

  confirmAction: () => {
    const state = get();
    if (!state.sessionId || !state.pendingConfirmation) return;

    const { runId, toolCallId } = state.pendingConfirmation;
    set({ pendingConfirmation: null, orbState: 'thinking' as OrbState });

    const resumeUrl = getResumeUrl(state.sessionId);
    const headers = getAuthHeaders();

    // Add assistant placeholder for the resumed response
    const assistantPlaceholderId = `msg-${Date.now()}-resume`;
    const assistantPlaceholder: ChatMessage = {
      id: assistantPlaceholderId,
      role: 'assistant',
      content: '',
      inputMode: 'text',
      timestamp: new Date(),
    };

    set((s) => ({ messages: [...s.messages, assistantPlaceholder] }));

    fetch(resumeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ confirmed: true, runId, toolCallId }),
      credentials: 'include',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let assistantText = '';
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (line.startsWith('0:')) {
              try {
                const text = JSON.parse(line.slice(2));
                assistantText += text;
                set((s) => {
                  const msgs = s.messages.map((m) =>
                    m.id === assistantPlaceholderId ? { ...m, content: assistantText } : m,
                  );
                  return { messages: msgs };
                });
              } catch {
                /* skip */
              }
            } else if (line.startsWith('a:')) {
              try {
                const followUps = JSON.parse(line.slice(2));
                if (Array.isArray(followUps)) {
                  assistantText = assistantText.replace(/<followups>\s*[\s\S]*?<\/followups>\s*$/, '').trimEnd();
                  set((s) => {
                    const msgs = s.messages.map((m) =>
                      m.id === assistantPlaceholderId ? { ...m, content: assistantText } : m,
                    );
                    return { messages: msgs, suggestedFollowUps: followUps };
                  });
                }
              } catch {
                /* skip */
              }
            }
          }
        }

        set({ orbState: 'idle' as OrbState });
      })
      .catch(() => {
        set((s) => {
          const msgs = s.messages.map((m) =>
            m.id === assistantPlaceholderId ? { ...m, content: 'Failed to confirm the action. Please try again.' } : m,
          );
          return { messages: msgs, orbState: 'idle' as OrbState };
        });
      });
  },

  cancelAction: () => {
    const state = get();
    if (!state.sessionId || !state.pendingConfirmation) return;

    const { action, runId, toolCallId } = state.pendingConfirmation;
    set({ pendingConfirmation: null });

    // Add cancellation message to chat
    set((s) => ({
      messages: [
        ...s.messages,
        {
          id: `cancel-${Date.now()}`,
          role: 'assistant' as const,
          content: `${action} was cancelled.`,
          inputMode: 'text' as const,
          timestamp: new Date(),
        },
      ],
    }));

    // Send cancel to backend (fire and forget — no stream expected)
    const resumeUrl = getResumeUrl(state.sessionId);
    const headers = getAuthHeaders();
    fetch(resumeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ confirmed: false, runId, toolCallId }),
      credentials: 'include',
    }).catch(() => {
      /* best effort */
    });
  },

  setDraftInput: (draft) => set({ draftInput: draft }),
  setSuggestedFollowUps: (suggestedFollowUps) => set({ suggestedFollowUps }),
  setHasUnreadAsync: (hasUnread) => set({ hasUnreadAsync: hasUnread }),
  setOrbState: (orbState) => set({ orbState }),
  setActiveTranscript: (text) => set({ activeTranscript: text }),
  setVoicePrefs: (voicePrefs) => set({ voicePrefs }),

  clearSession: () => {
    set({
      sessionId: null,
      messages: [],
      orbState: 'idle',
      activeTranscript: '',
      pendingConfirmation: null,
      suggestedFollowUps: [],
      isViewingHistory: false,
      viewedMessages: [],
    });
  },

  loadHistory: async () => {
    set({ isLoadingHistory: true });
    try {
      const res = await listConversations(10);
      set({ pastConversations: res.conversations, isLoadingHistory: false });
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  viewConversation: async (conversationId: string) => {
    set({ isLoadingHistory: true });
    try {
      const res = await getConversationMessages(conversationId);
      const messages: ChatMessage[] = res.messages.map((m) => ({
        id: m.messageId,
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
        inputMode: m.inputMode as InputMode,
        timestamp: new Date(m.createdAt),
        intent: m.intent as Intent | undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        card: m.card as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: m.action as any,
        speakText: m.speakText ?? undefined,
      }));
      set({ isViewingHistory: true, viewedMessages: messages, isLoadingHistory: false });
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  clearView: () => set({ isViewingHistory: false, viewedMessages: [] }),
}));
