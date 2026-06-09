'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAssistantStore } from '../store';

const SCROLL_AMOUNT = 200;

interface AssistantActionBarProps {
  onSelect: (text: string) => void;
  /** Drop the top divider — used when the bar sits directly above an input
      (home variant) rather than above the chat scroll area. */
  hideTopBorder?: boolean;
}

/**
 * Dynamic follow-up suggestions surfaced after a Assistant response. Renders
 * nothing when the store has no follow-ups — generic capability prompts
 * now live in the command palette (AssistantCommandPalette), not here.
 */
export function AssistantActionBar({ onSelect, hideTopBorder = false }: AssistantActionBarProps) {
  const followUps = useAssistantStore((s) => s.suggestedFollowUps);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: 0 });
    requestAnimationFrame(updateScrollState);
  }, [followUps, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    updateScrollState();
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  const scroll = useCallback((direction: 'left' | 'right') => {
    scrollRef.current?.scrollBy({
      left: direction === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT,
      behavior: 'smooth',
    });
  }, []);

  if (followUps.length === 0) return null;

  return (
    <div className={`shrink-0 ${hideTopBorder ? '' : 'border-t border-border/50'}`}>
      <div className="px-3 pt-2 pb-1">
        <span className="text-[9px] text-muted-foreground/50 uppercase tracking-[0.12em] font-medium">follow up</span>
      </div>

      <div className="relative group/bar">
        {canScrollLeft && (
          <div className="hidden sm:flex absolute left-0 top-0 bottom-2 items-center pl-0.5 z-10">
            <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-background to-transparent pointer-events-none" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scroll('left')}
              className="relative z-10 h-6 w-6 rounded-full shadow-sm"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}

        <div
          ref={scrollRef}
          className="overflow-x-auto px-3 pb-2 assistant-hide-scrollbar"
          style={{
            scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="flex gap-1.5 min-w-max"
          >
            {followUps.map((text, i) => (
              <motion.button
                key={text}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                onClick={() => onSelect(text)}
                className="px-3 py-1.5 text-[11px] text-muted-foreground whitespace-nowrap rounded-full border border-border/40 bg-muted/30 hover:bg-muted/60 hover:text-foreground hover:border-border/60 transition-all duration-150 flex items-center gap-1.5 shrink-0"
              >
                {text}
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  className="opacity-30"
                >
                  <path d="M5 12h14" />
                  <path d="M12 5l7 7-7 7" />
                </svg>
              </motion.button>
            ))}
          </motion.div>
        </div>

        {canScrollRight && (
          <div className="hidden sm:flex absolute right-0 top-0 bottom-2 items-center pr-0.5 z-10">
            <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-background to-transparent pointer-events-none" />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => scroll('right')}
              className="relative z-10 h-6 w-6 rounded-full shadow-sm"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
