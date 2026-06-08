'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@sally/ui/components/ui/button';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { Send, Sparkles } from 'lucide-react';
import { useSallyStore } from '../store';
import { useVoice } from '../voice/voice-provider';
import { showError } from '@/shared/lib/toast';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import type { UserMode } from '../engine/types';
import { matchAction } from '@/features/home/lib/action-matcher';
import { useHomeSearch } from '@/features/home/hooks/use-home-search';
import { SearchDropdown } from './SearchDropdown';
import { SallyActionBar } from './SallyActionBar';
import { SallyCommandPalette } from './SallyCommandPalette';
import { MentionPicker } from './MentionPicker';
import { useMentionSearch } from '../hooks/use-mention-search';
import { getMentionFragment, buildMentionText } from '../lib/mention';
import type { SearchApiResult } from '@/shared/lib/search';

// ── Variant ────────────────────────────────────────────────────────────────

export type SallyInputVariant = 'home' | 'panel';

// ── Placeholder questions ──────────────────────────────────────────────────

// Home variant doubles as a search bar — the first entry is a dual-purpose
// hint ("ask + search") and the rest mix Sally questions with entity lookups.
// Panel variant is chat-only (copilot) — the first entry should read as a
// pure "ask Sally" prompt with no search framing.
const PLACEHOLDER_QUESTIONS: Record<UserMode, string[]> = {
  prospect: [
    'Ask Sally anything about the platform…',
    '"What is SALLY?"',
    '"How does route planning work?"',
    '"What integrations do you support?"',
    '"Can I see pricing plans?"',
    '"Book a demo"',
  ],
  dispatcher: [
    'Ask Sally or search loads, drivers, invoices…',
    '"Show me all active alerts"',
    '"Who\'s available for a Dallas pickup?"',
    'Load SL-10294',
    'Driver Marcus Chen',
    '"Run a Shield compliance audit"',
    '"Generate invoice for load L-1045"',
  ],
  driver: [
    'Ask Sally or search your loads…',
    '"How much drive time do I have?"',
    '"What\'s my next stop?"',
    '"I\'m at the shipper"',
    '"Report a delay"',
    '"Show my settlement"',
  ],
  owner: [
    'Ask Sally or search loads, drivers, invoices…',
    '"What needs my attention right now?"',
    '"Who\'s available for a pickup?"',
    'Invoice INV-8821',
    '"Show overdue invoices over $5,000"',
    '"Approve pending settlements"',
    '"Run a compliance audit"',
  ],
  admin: [
    'Ask Sally or search loads, drivers, invoices…',
    '"Show fleet status overview"',
    '"Any HOS violations today?"',
    '"What loads are ready to invoice?"',
    'Driver Marcus Chen',
    '"Show active alerts"',
  ],
  super_admin: [
    'Ask Sally or search the platform…',
    '"System status overview"',
    '"Show fleet status"',
    '"Any active alerts?"',
    '"Driver HOS compliance check"',
    '"Platform metrics"',
  ],
  customer: [
    'Ask Sally or search shipments, invoices…',
    '"Where are my shipments?"',
    '"Track my latest delivery"',
    '"Find my documents"',
    '"View my invoices"',
    '"What do I owe?"',
  ],
  support: [
    'Ask Sally or search tickets…',
    '"Check my ticket status"',
    '"I need help with billing"',
    '"Report a technical issue"',
    '"Request a feature"',
    '"Contact support"',
  ],
};

// Panel (copilot side-panel) — chat-only. The "@ to mention" suffix advertises
// the entity picker so the affordance is discoverable on an empty input.
const PANEL_MENTION_HINT = '  ·  @ to mention a load, driver, invoice…';
const PANEL_PLACEHOLDERS: Record<UserMode, string> = {
  prospect: 'Ask Sally anything…',
  dispatcher: `Ask Sally anything…${PANEL_MENTION_HINT}`,
  driver: `Ask Sally anything…${PANEL_MENTION_HINT}`,
  owner: `Ask Sally anything…${PANEL_MENTION_HINT}`,
  admin: `Ask Sally anything…${PANEL_MENTION_HINT}`,
  super_admin: `Ask Sally anything…${PANEL_MENTION_HINT}`,
  customer: `Ask Sally anything…${PANEL_MENTION_HINT}`,
  support: 'Ask Sally anything…',
};

// ── Props ──────────────────────────────────────────────────────────────────

export interface SallyInputProps {
  variant?: SallyInputVariant;
  /** Home variant only — called when matchAction or chip wants to navigate. */
  onNavigate?: (href: string) => void;
  /** Home variant only — called when input falls through to chat. */
  onEnterChat?: (message: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export function SallyInput({ variant = 'panel', onNavigate, onEnterChat }: SallyInputProps) {
  const [input, setInput] = useState('');
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(-1);
  const [searchDismissed, setSearchDismissed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const isHome = variant === 'home';

  const { orbState, isExpanded, userMode, sendMessage, stopGeneration, draftInput, setDraftInput } = useSallyStore();

  const {
    isVoiceActive,
    isVoiceAvailable,
    voiceState,
    activeTranscript,
    toggleVoice,
    sendCommand,
    error: voiceError,
  } = useVoice();

  const voicePrefs = useSallyStore((s) => s.voicePrefs);
  const { hasEntitlement } = usePlan();
  const voiceEntitled = hasEntitlement('voice_mode');

  // useHomeSearch internally gates on empty query, so passing '' makes the
  // panel variant a no-op fetch-wise.
  const { results: searchResults, hasQuery: searchHasQuery } = useHomeSearch(isHome ? input : '');
  const showSearchDropdown = isHome && searchHasQuery && searchResults.length > 0 && !searchDismissed;

  // @-mention picker — panel (chat) variant only. The home variant has its own
  // search/navigation dropdown above, so we never run both at once.
  const {
    results: mentionResults,
    isLoading: mentionLoading,
    hasQuery: mentionHasQuery,
  } = useMentionSearch(mentionQuery ?? '');
  const mentionOpen = !isHome && mentionQuery !== null;

  const isThinking = orbState === 'thinking';
  const placeholder = isHome
    ? (PLACEHOLDER_QUESTIONS[userMode] ?? PLACEHOLDER_QUESTIONS.dispatcher)[0]
    : (PANEL_PLACEHOLDERS[userMode] ?? PANEL_PLACEHOLDERS.dispatcher);

  // One-shot typewriter on the home variant — adds a subtle sense of life to
  // the input on first paint, then stays static (no distracting rotation).
  const [typedPlaceholder, setTypedPlaceholder] = useState(isHome ? '' : placeholder);
  useEffect(() => {
    if (!isHome) {
      setTypedPlaceholder(placeholder);
      return;
    }
    setTypedPlaceholder('');
    let i = 0;
    const tick = () => {
      i += 1;
      setTypedPlaceholder(placeholder.slice(0, i));
      if (i < placeholder.length) {
        // Slight jitter (50–70ms) mimics natural cadence — pure uniformity
        // reads as mechanical. Spaces pause a touch longer, like a human.
        const isSpace = placeholder[i - 1] === ' ';
        const delay = isSpace ? 90 : 50 + Math.random() * 20;
        timer = setTimeout(tick, delay);
      }
    };
    let timer = setTimeout(tick, 320); // a beat of stillness first
    return () => clearTimeout(timer);
  }, [isHome, placeholder]);

  // Auto-focus when panel opens (panel variant only)
  useEffect(() => {
    if (isHome) return;
    if (isExpanded && !isVoiceActive) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [isHome, isExpanded, isVoiceActive]);

  // Auto-focus on mount (home variant)
  useEffect(() => {
    if (!isHome) return;
    inputRef.current?.focus();
  }, [isHome]);

  // Pick up prefilled draft (panel variant only — home doesn't share this state)
  useEffect(() => {
    if (isHome) return;
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
  }, [isHome, draftInput, setDraftInput]);

  // Auto-grow textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [input]);

  // Reset search dropdown state on query change
  useEffect(() => {
    if (!isHome) return;
    setSearchSelectedIndex(-1);
    setSearchDismissed(false);
  }, [isHome, input]);

  // Voice errors
  useEffect(() => {
    if (!voiceError) return;
    showError(voiceError);
  }, [voiceError]);

  // V key shortcut (panel variant — home is competing with typing)
  useEffect(() => {
    if (isHome) return;
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
  }, [isHome, toggleVoice, isExpanded, isVoiceAvailable]);

  const handleSearchSelect = useCallback(
    (result: SearchApiResult) => {
      if (!onNavigate) return;
      setInput('');
      const url = new URL(result.href, 'http://placeholder');
      url.searchParams.set('entityType', result.type);
      url.searchParams.set('entityId', result.id);
      onNavigate(`${url.pathname}${url.search}`);
    },
    [onNavigate],
  );

  // Recompute the active @-mention fragment from the live caret (panel only).
  // Only reset the highlighted row when the QUERY actually changes — otherwise
  // a caret-sync fired on every keyup would slam the selection back to 0 and
  // break Arrow navigation. We compare against a ref (no extra render).
  const mentionQueryRef = useRef<string | null>(null);
  const syncMention = useCallback(
    (el: HTMLTextAreaElement) => {
      if (isHome) return;
      const frag = getMentionFragment(el.value, el.selectionStart ?? el.value.length);
      const nextQuery = frag ? frag.query : null;
      if (nextQuery !== mentionQueryRef.current) {
        mentionQueryRef.current = nextQuery;
        setMentionQuery(nextQuery);
        setMentionIndex(0);
      }
    },
    [isHome],
  );

  const closeMention = useCallback(() => {
    mentionQueryRef.current = null;
    setMentionQuery(null);
  }, []);

  // Replace the @fragment with the entity's clean plain-text reference. The
  // '@' and half-typed query never reach the message — Sally AI sees prose.
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

    if (isHome) {
      // Tier 1: matchAction (instant route)
      const action = matchAction(text);
      if (action?.href && onNavigate) {
        setInput('');
        onNavigate(action.href);
        return;
      }

      // Tier 2: search dropdown selection
      if (showSearchDropdown && searchSelectedIndex >= 0 && searchSelectedIndex < searchResults.length) {
        handleSearchSelect(searchResults[searchSelectedIndex]);
        return;
      }

      // Tier 3: chat fallback
      setInput('');
      onEnterChat?.(text);
      return;
    }

    // Panel variant — always chat
    sendMessage(text, 'text');
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    inputRef.current?.focus();
  }, [
    input,
    isThinking,
    isHome,
    onNavigate,
    onEnterChat,
    showSearchDropdown,
    searchSelectedIndex,
    searchResults,
    handleSearchSelect,
    sendMessage,
  ]);

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
      // `/` on an empty input opens the command palette. Linear/Slack/Notion
      // gesture. We require empty so we never hijack `/` mid-typing — users
      // searching loads (e.g. "L-1045/B") shouldn't summon the palette.
      if (e.key === '/' && input.length === 0 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
        return;
      }
      if (!isHome) return;
      if (e.key === 'Escape' && showSearchDropdown) {
        setSearchDismissed(true);
        setSearchSelectedIndex(-1);
        return;
      }
      if (showSearchDropdown && searchResults.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSearchSelectedIndex((prev) => (prev < searchResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSearchSelectedIndex((prev) => (prev > 0 ? prev - 1 : searchResults.length - 1));
        }
      }
    },
    [
      handleSend,
      input.length,
      isHome,
      showSearchDropdown,
      searchResults.length,
      mentionOpen,
      mentionResults,
      mentionIndex,
      handleMentionSelect,
      closeMention,
    ],
  );

  const handleMicTap = useCallback(() => {
    if (!isVoiceAvailable) return;
    toggleVoice();
  }, [isVoiceAvailable, toggleVoice]);

  // Palette picked a prompt while we're the home variant. Fill our local
  // textarea directly — the home page hides the floating Sally panel, so
  // setDraftInput + expandStrip (the panel-variant default) would silently
  // drop the prompt. Defer focus past the dialog's onCloseAutoFocus.
  const handleHomePalettePick = useCallback((text: string) => {
    setInput(text);
    setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 0);
  }, []);

  // ── Voice-active replacement UI (both variants) ──────────────────────────

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
          ? 'Sally is speaking...'
          : voiceState === 'processing'
            ? 'Thinking...'
            : '';

  if (isVoiceActive) {
    return (
      <div className={isHome ? '' : 'p-3'}>
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
                  useSallyStore.setState({ activeTranscript: '' });
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
      <div className={isHome ? 'w-full max-w-3xl mx-auto px-4 sm:px-0' : 'p-3'}>
        {/* Ask Sally suggestions — same component as the chat experience.
          Reusing SallyActionBar means home and chat surface the same set of
          capability questions per role; updating one updates both. */}
        {isHome && (
          <div className="mb-3 -mx-3 sm:mx-0">
            <SallyActionBar onSelect={(text) => onEnterChat?.(text)} hideTopBorder />
          </div>
        )}

        <div className="relative">
          {/* Search dropdown — home variant only */}
          {isHome && (
            <SearchDropdown
              results={searchResults}
              query={input}
              selectedIndex={searchSelectedIndex}
              onSelect={handleSearchSelect}
              onHover={setSearchSelectedIndex}
              visible={showSearchDropdown}
            />
          )}

          <div className="sally-input-glow rounded-2xl p-[1.5px]">
            <div className="rounded-[calc(1rem-1.5px)] bg-background border border-border/20">
              {/* Textarea + static placeholder */}
              <div className="relative">
                {!input && (
                  <div className="absolute left-3 right-3 top-[9px] pointer-events-none leading-5">
                    <span className="text-sm text-muted-foreground/40 block leading-5">
                      {typedPlaceholder}
                      {isHome && typedPlaceholder.length < placeholder.length && (
                        <span className="ml-0.5 inline-block w-[1px] h-3 bg-muted-foreground/40 animate-pulse align-middle" />
                      )}
                    </span>
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
                  aria-label="Ask Sally anything"
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
                            ? 'Voice Mode requires the Fleet plan'
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
                        {!voiceEntitled ? 'Voice Mode requires the Fleet plan' : 'Voice mode is not available'}
                      </TooltipContent>
                    )}
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPaletteOpen(true)}
                        className="shrink-0 h-8 px-2 gap-1.5 rounded-full text-muted-foreground hover:text-foreground"
                        aria-label="Ask Sally — see what she can do"
                      >
                        <span className="text-xs">Ask</span>
                        <kbd className="hidden sm:inline-flex h-4 items-center px-1 ml-0.5 text-2xs font-mono rounded border border-border bg-muted text-muted-foreground">
                          /
                        </kbd>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">See what Sally can do (/)</TooltipContent>
                  </Tooltip>

                  {/* Persistent @-mention affordance — mirrors the "Ask /" chip
                      so it reads as a real shortcut, and stays visible after the
                      placeholder is gone (panel variant only). */}
                  {!isHome && (
                    <span className="hidden sm:inline-flex items-center gap-1 ml-0.5 text-xs text-muted-foreground select-none">
                      <kbd className="inline-flex h-4 items-center px-1 text-2xs font-mono rounded border border-border bg-muted text-muted-foreground">
                        @
                      </kbd>
                      mention
                    </span>
                  )}
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
      <SallyCommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onPickPrompt={isHome ? handleHomePalettePick : undefined}
      />
    </>
  );
}
