'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Send, X } from 'lucide-react';
import { cn } from '@sally/ui';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';

interface MessageComposerProps {
  /** The driver's active load numbers — the @-mention picker options. */
  activeLoadNumbers: string[];
  /** True while a send is in flight. */
  isSending: boolean;
  /**
   * Send the message. `loadNumber` is the chosen tag — a load number, or
   * `null` for a general (no-load) message.
   */
  onSend: (content: string, loadNumber: string | null) => void;
  /** Composer placeholder — defaults to the dispatcher-side wording. */
  placeholder?: string;
}

/** Picker option for `@current` — resolves to the driver's first active load. */
const CURRENT = '@current';

/**
 * Message composer with @-mention load tagging. Typing `@` opens a load
 * picker; the picked load shows as a removable chip and tags the next
 * message. `@current` resolves to the driver's active load. With no tag the
 * message is general (no load).
 */
export function MessageComposer({
  activeLoadNumbers,
  isSending,
  onSend,
  placeholder = 'Message driver…  @ to tag a load',
}: MessageComposerProps) {
  const [input, setInput] = useState('');
  const [loadTag, setLoadTag] = useState<string | null>(null);
  // The @-token currently being typed (text after the last unmatched '@'),
  // or null when no mention is in progress.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  // Highlighted picker row — keyboard navigation.
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Stable ids wiring the input (combobox) to the @-picker listbox + options.
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const currentLoad = activeLoadNumbers[0] ?? null;

  // Picker rows: @current first (if the driver has an active load), then the
  // driver's other loads, filtered by whatever follows the '@'.
  const pickerOptions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const rows: Array<{ value: string; label: string; sub?: string }> = [];
    if (currentLoad && (CURRENT.includes(q) || 'current'.includes(q))) {
      rows.push({ value: currentLoad, label: '@current', sub: `#${currentLoad}` });
    }
    for (const ln of activeLoadNumbers) {
      if (ln.toLowerCase().includes(q)) rows.push({ value: ln, label: `#${ln}` });
    }
    return rows;
  }, [mentionQuery, activeLoadNumbers, currentLoad]);

  // Keep the highlighted row in range as the option list narrows.
  useEffect(() => {
    setActiveIndex(0);
  }, [mentionQuery]);

  const handleChange = (value: string) => {
    setInput(value);
    // An in-progress @-mention: the last '@' that starts a word (at the start
    // or after whitespace — so a mid-word '@' in an email doesn't trigger it)
    // with no whitespace after it.
    const at = value.lastIndexOf('@');
    const atWordStart = at === 0 || (at > 0 && /\s/.test(value[at - 1]));
    if (at === -1 || !atWordStart) {
      setMentionQuery(null);
      return;
    }
    const after = value.slice(at + 1);
    setMentionQuery(/\s/.test(after) ? null : after);
  };

  const pickLoad = (loadNumber: string) => {
    setLoadTag(loadNumber);
    // Strip the @-token the dispatcher was typing.
    const at = input.lastIndexOf('@');
    if (at !== -1) setInput(input.slice(0, at).trimEnd());
    setMentionQuery(null);
    inputRef.current?.focus();
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    onSend(text, loadTag);
    setInput('');
    setLoadTag(null);
    setMentionQuery(null);
  };

  const showPicker = mentionQuery !== null && pickerOptions.length > 0;

  return (
    <div className="relative flex flex-col gap-2 border-t border-border p-3">
      {/* @-mention load picker — floats above the input while typing '@'.
          Arrow keys move the highlight; Enter picks the highlighted row. */}
      {showPicker && (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Tag a load"
          className="absolute bottom-full left-3 right-3 mb-1 max-h-44 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
        >
          {pickerOptions.map((opt, i) => (
            <button
              key={opt.value}
              id={optionId(i)}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              onClick={() => pickLoad(opt.value)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex w-full items-center justify-between px-3 py-2 text-left text-sm text-foreground',
                i === activeIndex ? 'bg-muted' : 'hover:bg-muted',
              )}
            >
              <span>{opt.label}</span>
              {opt.sub && <span className="text-2xs text-muted-foreground">{opt.sub}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Current load tag — a removable chip; cleared = a general message. */}
      {loadTag && (
        <span className="flex w-fit items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-2xs font-medium text-foreground">
          re: #{loadTag}
          <button
            type="button"
            onClick={() => setLoadTag(null)}
            aria-label="Remove load tag"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </span>
      )}

      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={(e) => {
            // While the @-picker is open, the arrow keys + Enter drive it.
            if (showPicker) {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, pickerOptions.length - 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
                return;
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                pickLoad(pickerOptions[activeIndex].value);
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                setMentionQuery(null);
                return;
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={placeholder}
          aria-label="Message"
          // Combobox wiring so a screen reader follows the @-picker highlight.
          role="combobox"
          aria-expanded={showPicker}
          aria-controls={showPicker ? listboxId : undefined}
          aria-activedescendant={showPicker ? optionId(activeIndex) : undefined}
          className="h-9 text-sm"
        />
        <Button
          size="icon"
          onClick={handleSend}
          loading={isSending}
          disabled={!input.trim()}
          aria-label="Send message"
          className="h-9 w-9 shrink-0"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
