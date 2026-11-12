import { create } from 'zustand';
import { STORAGE_KEYS } from '@appshore/web-core/shared/constants';
import type { ChatMessage, OrbState, UserMode, InputMode, Intent, ChatLayout } from './engine/types';
import { DEFAULT_VOICE_PREFS, type VoicePreferences } from './voice/types';
import { chatErrorCopy, chatRequestError } from './lib/chat-error';
import {
  applyCitationFrame,
  applyReadingFrame,
  failedTurnText,
  readFrames,
  settleMessage,
  updatePlaceholder,
  type FrameHandlers,
  type StreamError,
} from './lib/stream-frames';
import {
  createConversation as createConversationApi,
  getConversationMessages,
  getStreamingUrl,
  getResumeUrl,
  getAuthHeaders,
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

  // Chat history (the list itself is a TanStack query: hooks/use-conversation-history)
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

type SetState = (partial: Partial<AssistantState> | ((state: AssistantState) => Partial<AssistantState>)) => void;

/**
 * Read one turn's stream into the placeholder message: text, cards, follow-ups, citations and the reading line as they
 * arrive, a confirmation card on suspend. Frames this client does not know are skipped (`lib/stream-frames.ts`).
 * Returns the text that streamed and, when the turn ended with an `x:` frame, why it failed.
 */
async function readTurn(
  body: ReadableStream<Uint8Array>,
  placeholderId: string,
  set: SetState,
): Promise<{ assistantText: string; failure: StreamError | null }> {
  let assistantText = '';
  let failure: StreamError | null = null;
  const updateMessage = (update: (m: ChatMessage) => ChatMessage) =>
    set((s) => ({ messages: updatePlaceholder(s.messages, placeholderId, update) }));

  const handlers: FrameHandlers = {
    text: (delta) => {
      assistantText += delta;
      updateMessage((m) => ({ ...settleMessage(m), content: assistantText }));
    },
    card: (card) => updateMessage((m) => ({ ...m, card })),
    reading: (frame) => updateMessage((m) => applyReadingFrame(m, frame)),
    citation: (citation) => updateMessage((m) => applyCitationFrame(m, citation)),
    followups: (followUps) => {
      // The <followups> block is stripped from the visible text.
      assistantText = assistantText.replace(/<followups>\s*[\s\S]*?<\/followups>\s*$/, '').trimEnd();
      set((s) => ({
        messages: updatePlaceholder(s.messages, placeholderId, (m) => ({ ...m, content: assistantText })),
        suggestedFollowUps: followUps,
      }));
    },
    suspend: (raw) => {
      // HITL confirmation payload: the agent is suspended, awaiting the person's decision.
      const payload = raw as unknown as PendingConfirmation;
      set((s) => ({
        pendingConfirmation: payload,
        orbState: 'idle' as OrbState,
        messages: [
          ...s.messages,
          {
            id: `confirm-${Date.now()}`,
            role: 'assistant',
            content: payload.description,
            inputMode: 'text',
            timestamp: new Date(),
            card: { type: 'confirmation', data: payload as unknown as Record<string, unknown> },
          },
        ],
      }));
    },
    error: (error) => {
      failure = error;
    },
  };

  await readFrames(body, handlers);
  updateMessage(settleMessage);
  return { assistantText, failure };
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
          // Refused before the stream began: the body is the error envelope, whose detail the bubble shows.
          throw await chatRequestError(response);
        }
        if (!response.body) throw new Error('No response body');

        const { assistantText, failure } = await readTurn(response.body, assistantPlaceholderId, set);
        activeAbortController = null;
        if (failure) {
          // The turn failed after it began: keep what streamed, then say why it stopped.
          set((s) => ({
            messages: updatePlaceholder(s.messages, assistantPlaceholderId, (m) => ({
              ...settleMessage(m),
              content: failedTurnText(assistantText, failure),
            })),
          }));
        }
        set({ orbState: 'idle' as OrbState });
      })
      .catch((err) => {
        activeAbortController = null;
        // Aborted by user — keep partial text, just stop thinking
        if (err instanceof DOMException && err.name === 'AbortError') {
          set((s) => ({
            messages: updatePlaceholder(s.messages, assistantPlaceholderId, settleMessage),
            orbState: 'idle' as OrbState,
          }));
          return;
        }
        // Show error message on failure
        set((s) => ({
          messages: updatePlaceholder(s.messages, assistantPlaceholderId, (m) => ({
            ...settleMessage(m),
            content: chatErrorCopy(err),
          })),
          orbState: 'idle' as OrbState,
        }));
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
        if (!response.ok) throw await chatRequestError(response);
        if (!response.body) throw new Error('No response body');

        const { assistantText, failure } = await readTurn(response.body, assistantPlaceholderId, set);
        if (failure) {
          set((s) => ({
            messages: updatePlaceholder(s.messages, assistantPlaceholderId, (m) => ({
              ...settleMessage(m),
              content: failedTurnText(assistantText, failure),
            })),
          }));
        }
        set({ orbState: 'idle' as OrbState });
      })
      .catch((err) => {
        set((s) => ({
          messages: updatePlaceholder(s.messages, assistantPlaceholderId, (m) => ({
            ...settleMessage(m),
            content: chatErrorCopy(err),
          })),
          orbState: 'idle' as OrbState,
        }));
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
        citations: m.citations,
      }));
      set({ isViewingHistory: true, viewedMessages: messages, isLoadingHistory: false });
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  clearView: () => set({ isViewingHistory: false, viewedMessages: [] }),
}));
