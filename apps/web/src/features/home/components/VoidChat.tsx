'use client';

import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@sally/ui/components/ui/button';
import { ArrowLeft, PenLine } from 'lucide-react';
import { SallyOrb } from '@/features/platform/sally-ai/components/SallyOrb';
import { SallyChat } from '@/features/platform/sally-ai/components/SallyChat';
import { VoiceProvider } from '@/features/platform/sally-ai/voice/voice-provider';
import { useSallyStore } from '@/features/platform/sally-ai/store';

// ── Props ──────────────────────────────────────────────────────────────────

interface VoidChatProps {
  onReset: () => void;
}

// ── Component ──────────────────────────────────────────────────────────────

/**
 * VoidChat — full-screen chat state for the home page.
 *
 * Renders the REAL SallyChat component (with recents, history, etc.)
 * inside a full-page container with a sticky header.
 * This gives feature parity with the floating panel but in an immersive layout.
 */
export function VoidChat({ onReset }: VoidChatProps) {
  const orbState = useSallyStore((s) => s.orbState);

  // ESC key resets to idle state
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = (e.target as HTMLElement).isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;

      if (e.key === 'Escape') {
        onReset();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onReset]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="-m-4 md:-m-8 flex flex-col overflow-hidden"
      style={{ height: 'calc(100vh - 3.5rem)' }}
    >
      {/* Sticky chat header */}
      <div className="sticky top-0 z-10 flex items-center justify-between shrink-0 border-b border-border/60 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            className="h-9 px-3 gap-2 text-sm"
            aria-label="Back to home"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <span className="h-5 w-px bg-border" aria-hidden />
          <div className="flex items-center gap-2 min-w-0">
            <SallyOrb state={orbState} size="sm" />
            <span className="text-sm font-semibold text-foreground truncate">Sally</span>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onReset} className="h-9 px-3 text-sm gap-2">
          <PenLine className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">New conversation</span>
          <span className="sm:hidden">New</span>
        </Button>
      </div>

      {/* SallyChat — the real component with recents, history, etc. */}
      <div className="flex-1 flex flex-col min-h-0 max-w-4xl mx-auto w-full">
        <VoiceProvider>
          <SallyChat embedded />
        </VoiceProvider>
      </div>
    </motion.div>
  );
}
