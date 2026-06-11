'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { Textarea } from '@app/ui/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/ui/components/ui/tooltip';
import { Send, Sparkles } from 'lucide-react';
import { useAssistantStore } from '../store';
import { useVoice } from '../voice/voice-provider';
import { showError } from '@/shared/lib/toast';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import type { UserMode } from '../engine/types';
import { MentionPicker } from './MentionPicker';
import { useMentionSearch } from '../hooks/use-mention-search';
import { getMentionFragment, buildMentionText } from '../lib/mention';
import type { SearchApiResult } from '@/shared/lib/search';

// ── Placeholder questions ──────────────────────────────────────────────────

// Copilot side-panel — chat-only. The "@ to mention" suffix advertises the
// entity picker so the affordance is discoverable on an empty input.
const MENTION_HINT = '  ·  @ to mention';
const PLACEHOLDERS: Record<UserMode, string> = {
  member: `Ask anything…${MENTION_HINT}`,
  owner: `Ask anything…${MENTION_HINT}`,
  admin: `Ask anything…${MENTION_HINT}`,
  super_admin: `Ask anything…${MENTION_HINT}`,
};

// ── Component ──────────────────────────────────────────────────────────────

export function AssistantInput() {
  const [input, setInput] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { orbState, isExpanded, userMode, sendMessage, stopGeneration, draftInput, setDraftInput } =
    useAssistantStore();

  const {
    isVoiceActive,
    isVoiceAvailable,
    voiceState,
    activeTranscript,
    toggleVoice,
    sendCommand,
    error: voiceError,
  } = useVoice();

  const voicePrefs = useAssistantStore((s) => s.voicePrefs);
  const { hasEntitlement } = usePlan();
  const voiceEntitled = hasEntitlement('voice_mode');

  // @-mention picker — entity references inside the chat input.
  const {
    results: mentionResults,
    isLoading: mentionLoading,
    hasQuery: mentionHasQuery,
  } = useMentionSearch(mentionQuery ?? '');
  const mentionOpen = mentionQuery !== null;

  const isThinking = orbState === 'thinking';
  const placeholder = PLACEHOLDERS[userMode] ?? PLACEHOLDERS.member;

  // Auto-focus when panel opens
  useEffect(() => {
    if (isExpanded && !isVoiceActive) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isExpanded, isVoiceActive]);

  // Pick up prefilled draft
  useEffect(() => {
    if (draftInput) {
      setInput(draftInput);
      setDraftInput(null);
      setTimeout(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      }, 350);
    }
  }, [draftInput, setDraftInput]);

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  // Voice errors
  useEffect(() => {
    if (!voiceError) return;
    showError(voiceError);
  }, [voiceError]);

  // V key shortcut
  useEffect(() => {
    if (!isExpanded || !isVoiceAvailable) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        e.preventDefault();
        toggleVoice();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleVoice, isExpanded, isVoiceAvailable]);

  // Recompute the active @-mention fragment from the live caret.
  // Only reset the highlighted row when the QUERY actually changes — otherwise
  // a caret-sync fired on every keyup would slam the selection back to 0 and
  // break Arrow navigation. We compare against a ref (no extra render).
  const mentionQueryRef = useRef<string | null>(null);
  const syncMention = useCallback((el: HTMLTextAreaElement) => {
    const frag = getMentionFragment(el.value, el.selectionStart ?? el.value.length);
    const nextQuery = frag ? frag.query : null;
    if (nextQuery !== mentionQueryRef.current) {
      mentionQueryRef.current = nextQuery;
      setMentionQuery(nextQuery);
      setMentionIndex(0);
    }
  }, []);

  const closeMention = useCallback(() => {
    mentionQueryRef.current = null;
    setMentionQuery(null);
  }, []);

  // Replace the @fragment with the entity's clean plain-text reference. The
  // '@' and half-typed query never reach the message — Assistant AI sees prose.
  const handleMentionSelect = useCallback(
    (result: SearchApiResult) => {
      const el = inputRef.current;
      if (!el) return;
      const caret = el.selectionStart ?? el.value.length;
      const frag = getMentionFragment(el.value, caret);
      if (!frag) {
        closeMention();
        return;
      }
      const insert = `${buildMentionText(result)} `;
      const next = el.value.slice(0, frag.at) + insert + el.value.slice(caret);
      const pos = frag.at + insert.length;
      setInput(next);
      closeMention();
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [closeMention],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isThinking) return;

    sendMessage(text, 'text');
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    inputRef.current?.focus();
  }, [input, isThinking, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // The @-mention picker owns navigation/submit keys while it's open
      // (panel variant). Each branch returns, so Enter→send below only fires
      // when the picker is closed. Enter is swallowed even with zero results so
      // a visible-but-empty picker (loading / "No matches") never sends the
      // half-typed message out from under the user.
      if (mentionOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeMention();
          return;
        }
        if (mentionResults.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setMentionIndex((i) => (i + 1) % mentionResults.length);
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setMentionIndex((i) => (i - 1 + mentionResults.length) % mentionResults.length);
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleMentionSelect(mentionResults[mentionIndex]);
            return;
          }
        } else if (e.key === 'Enter' && !e.shiftKey) {
          // Picker open but no results yet — swallow Enter rather than send.
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }
    },
    [handleSend, mentionOpen, mentionResults, mentionIndex, handleMentionSelect, closeMention],
  );

  const handleMicTap = useCallback(() => {
    if (!isVoiceAvailable) return;
    toggleVoice();
  }, [isVoiceAvailable, toggleVoice]);

  // ── Voice-active replacement UI ──────────────────────────────────────────

  const orbColor =
    voiceState === 'speaking'
      ? 'bg-foreground'
      : voiceState === 'processing' || voiceState === 'connecting'
        ? 'bg-foreground/50'
        : 'bg-foreground';

  const statusText =
    voiceState === 'connecting'
      ? 'Connecting...'
      : voiceState === 'listening'
        ? 'Listening...'
        : voiceState === 'speaking'
          ? 'Speaking...'
          : voiceState === 'processing'
            ? 'Thinking...'
            : '';

  if (isVoiceActive) {
    return (
      <div className="p-3">
        <div className="rounded-2xl bg-muted/80 backdrop-blur-sm border border-foreground/20">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <motion.div
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-2 border-foreground/30"
              animate={
                voiceState === 'processing'
                  ? { scale: [1, 1.15, 1], opacity: [1, 0.5, 1] }
                  : voiceState === 'listening' || voiceState === 'speaking'
                    ? { scale: [1, 1.08, 1] }
                    : {}
              }
              transition={
                voiceState === 'processing'
                  ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
                  : voiceState === 'listening' || voiceState === 'speaking'
                    ? { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
                    : {}
              }
            >
              <div className={`w-3 h-3 rounded-full ${orbColor}`} />
            </motion.div>
            <div className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                {activeTranscript ? (
                  <motion.p
                    key="transcript"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-foreground truncate"
                  >
                    {activeTranscript}
                  </motion.p>
                ) : (
                  <motion.p
                    key="status"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-xs text-muted-foreground"
                  >
                    {statusText}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {voicePrefs.voiceMode === 'manual' && activeTranscript && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  sendCommand({ type: 'send', text: activeTranscript });
                  useAssistantStore.setState({ activeTranscript: '' });
                }}
                className="shrink-0 h-9 w-9 rounded-full text-foreground hover:bg-muted"
                aria-label="Send voice message"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleVoice}
              className="shrink-0 h-9 w-9 rounded-full text-destructive hover:bg-destructive/10"
              aria-label="Stop voice mode"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Standard input ───────────────────────────────────────────────────────

  return (
    <>
      <div className="p-3">
        <div className="relative">
          <div className="assistant-input-glow rounded-2xl p-[1.5px]">
            <div className="rounded-[calc(1rem-1.5px)] bg-background border border-border/20">
              {/* Textarea + static placeholder */}
              <div className="relative">
                {!input && (
                  <div className="absolute left-3 right-3 top-[9px] pointer-events-none leading-5">
                    <span className="text-sm text-muted-foreground/40 block leading-5">{placeholder}</span>
                  </div>
                )}
                {/* @-mention picker — panel variant only, anchored above the input */}
                {mentionOpen && (
                  <MentionPicker
                    results={mentionResults}
                    isLoading={mentionLoading}
                    hasQuery={mentionHasQuery}
                    activeIndex={mentionIndex}
                    onSelect={handleMentionSelect}
                    onHover={setMentionIndex}
                  />
                )}
                <Textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    syncMention(e.target);
                  }}
                  onClick={(e) => syncMention(e.currentTarget)}
                  onKeyUp={(e) => syncMention(e.currentTarget)}
                  className="min-h-[56px] max-h-[140px] resize-none text-sm leading-5 bg-transparent border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 overflow-y-auto placeholder:text-transparent"
                  disabled={isThinking}
                  rows={2}
                  onKeyDown={handleKeyDown}
                  aria-label="Ask anything"
                />
              </div>

              {/* Bottom action row */}
              <div className="flex items-center justify-between px-2 pb-2">
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={voiceEntitled ? handleMicTap : undefined}
                        disabled={isThinking || !isVoiceAvailable || !voiceEntitled}
                        className={`shrink-0 h-8 w-8 rounded-full ${!isVoiceAvailable || !voiceEntitled ? 'opacity-35' : ''}`}
                        aria-label={
                          !voiceEntitled
                            ? 'Voice Mode requires an upgraded plan'
                            : isVoiceAvailable
                              ? 'Start voice mode (V)'
                              : 'Voice mode is not available'
                        }
                      >
                        {!voiceEntitled ? (
                          <Sparkles className="h-3.5 w-3.5" />
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                            <line x1="12" y1="19" x2="12" y2="23" />
                          </svg>
                        )}
                      </Button>
                    </TooltipTrigger>
                    {(!isVoiceAvailable || !voiceEntitled) && (
                      <TooltipContent side="top">
                        {!voiceEntitled ? 'Voice Mode requires an upgraded plan' : 'Voice mode is not available'}
                      </TooltipContent>
                    )}
                  </Tooltip>

                  {/* Persistent @-mention affordance — stays visible after the
                      placeholder is gone. */}
                  <span className="hidden sm:inline-flex items-center gap-1 ml-0.5 text-xs text-muted-foreground select-none">
                    <kbd className="inline-flex h-4 items-center px-1 text-2xs font-mono rounded border border-border bg-muted text-muted-foreground">
                      @
                    </kbd>
                    mention
                  </span>
                </div>

                {isThinking ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={stopGeneration}
                        className="shrink-0 h-9 w-9 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20"
                        aria-label="Stop generating"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="6" y="6" width="12" height="12" rx="2" />
                        </svg>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Stop generating</TooltipContent>
                  </Tooltip>
                ) : (
                  <motion.div whileHover={{ rotate: 45 }} transition={{ duration: 0.2 }}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleSend}
                      disabled={!input.trim()}
                      className="shrink-0 h-9 w-9 rounded-full bg-foreground text-background hover:bg-foreground/90 disabled:bg-muted disabled:text-muted-foreground"
                      aria-label="Send message"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M5 12h14" />
                        <path d="M12 5l7 7-7 7" />
                      </svg>
                    </Button>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
