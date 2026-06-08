'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { useSallyStore } from '../store';
import { SallyOrb } from './SallyOrb';
import { SallyChat } from './SallyChat';
import { VoiceProvider } from '../voice/voice-provider';
import { useEffect, useRef, useCallback, useState } from 'react';
import { STORAGE_KEYS } from '@/shared/constants';
import type { ChatLayout } from '../engine/types';
import { SallyVoiceSettings } from './SallyVoiceSettings';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/ui/components/ui/tooltip';

const MIN_SIDE_WIDTH = 320;
const DEFAULT_SIDE_WIDTH = 380;

function LayoutModeButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClick}
          className={`h-7 w-7 ${active ? 'bg-gray-200 dark:bg-gray-700 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          aria-label={label}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// Float uses inset+margin centering (Framer Motion controls `transform`)
const floatClasses =
  'fixed z-50 inset-4 sm:inset-0 sm:m-auto sm:max-w-4xl sm:w-[90vw] sm:h-[70vh] sm:rounded-2xl sm:shadow-2xl';

export function SallyStrip({ hideOrb }: { hideOrb?: boolean } = {}) {
  const {
    isExpanded,
    orbState,
    userMode,
    chatLayout,
    hasUnreadAsync,
    expandStrip,
    collapseStrip,
    setChatLayout,
    stopGeneration,
    orbState: currentOrbState,
  } = useSallyStore();

  // Track the layout at the moment the panel opens so open/close animations
  // use the correct variant, while layout switches within an open panel
  // only change CSS classes (no re-mount / flicker).
  const openLayoutRef = useRef<ChatLayout>(chatLayout);

  // Drag-to-resize state for side panel mode
  const [sideWidth, setSideWidth] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_SIDE_WIDTH;
    const stored = localStorage.getItem(STORAGE_KEYS.APP_SIDE_WIDTH);
    return stored ? Math.max(MIN_SIDE_WIDTH, parseInt(stored, 10)) : DEFAULT_SIDE_WIDTH;
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartWidthRef = useRef(DEFAULT_SIDE_WIDTH);

  // Float panel drag-to-move state
  const [floatOffset, setFloatOffset] = useState({ x: 0, y: 0 });
  const [isFloatDragging, setIsFloatDragging] = useState(false);
  const floatDragStartRef = useRef({ x: 0, y: 0 });
  const floatOffsetStartRef = useRef({ x: 0, y: 0 });

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartXRef.current = e.clientX;
      dragStartWidthRef.current = sideWidth;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [sideWidth],
  );

  const handleDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const maxWidth = Math.floor(window.innerWidth / 2);
      const delta = dragStartXRef.current - e.clientX;
      const newWidth = Math.min(maxWidth, Math.max(MIN_SIDE_WIDTH, dragStartWidthRef.current + delta));
      setSideWidth(newWidth);
      document.documentElement.style.setProperty('--sally-side-width', `${newWidth}px`);
    },
    [isDragging],
  );

  const handleDragEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    localStorage.setItem(STORAGE_KEYS.APP_SIDE_WIDTH, String(sideWidth));
  }, [isDragging, sideWidth]);

  // Float panel drag handlers
  const handleFloatDragStart = useCallback(
    (e: React.PointerEvent) => {
      // Only drag from the header grip area, not buttons
      if ((e.target as HTMLElement).closest('button')) return;
      e.preventDefault();
      setIsFloatDragging(true);
      floatDragStartRef.current = { x: e.clientX, y: e.clientY };
      floatOffsetStartRef.current = { ...floatOffset };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [floatOffset],
  );

  const handleFloatDragMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isFloatDragging) return;
      setFloatOffset({
        x: floatOffsetStartRef.current.x + (e.clientX - floatDragStartRef.current.x),
        y: floatOffsetStartRef.current.y + (e.clientY - floatDragStartRef.current.y),
      });
    },
    [isFloatDragging],
  );

  const handleFloatDragEnd = useCallback(() => {
    setIsFloatDragging(false);
  }, []);

  // Set/clear the CSS variable when side panel is visible or width changes
  useEffect(() => {
    if (isExpanded && chatLayout === 'side') {
      document.documentElement.style.setProperty('--sally-side-width', `${sideWidth}px`);
    } else {
      document.documentElement.style.removeProperty('--sally-side-width');
    }
  }, [isExpanded, chatLayout, sideWidth]);

  // Capture the layout when the panel opens or layout changes while open
  // Reset float offset when switching away from float or closing
  useEffect(() => {
    if (isExpanded) {
      openLayoutRef.current = chatLayout;
    }
    if (!isExpanded || chatLayout !== 'float') {
      setFloatOffset({ x: 0, y: 0 });
    }
  }, [isExpanded, chatLayout]);

  // Stop any active generation and close the panel
  const closeChat = useCallback(() => {
    if (currentOrbState === 'thinking') {
      stopGeneration();
    }
    collapseStrip();
  }, [currentOrbState, stopGeneration, collapseStrip]);

  // Keyboard shortcut: S to toggle
  const handleToggle = useCallback(() => {
    if (isExpanded) {
      closeChat();
    } else {
      expandStrip();
    }
  }, [isExpanded, closeChat, expandStrip]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Escape always closes the panel — even when typing in the textarea.
      // Without this, the auto-focused input swallows Esc and users have to
      // click outside the textarea first before Esc works.
      // EXCEPTION: if a modal/palette/picker is open, let it own Escape —
      // closing the underlying panel at the same time would surprise the user.
      // We register in capture phase so this check runs BEFORE the modal
      // tears itself down (otherwise aria-modal disappears before we see it).
      if (e.key === 'Escape' && isExpanded) {
        // Radix Dialog sets data-state="open" on the [role="dialog"] node
        // while open. We register in capture phase so this runs BEFORE
        // Radix tears the dialog down, so the attribute is still there.
        const isModalOpen = document.querySelector('[role="dialog"][data-state="open"]');
        // The @-mention picker is a plain cmdk popover (not a Radix dialog), so
        // it marks itself with data-mention-picker="open". First Esc closes the
        // picker (SallyInput handles that); the panel must stay open.
        const isMentionPickerOpen = document.querySelector('[data-mention-picker="open"]');
        if (isModalOpen || isMentionPickerOpen) return;
        closeChat();
        return;
      }

      // Single-letter shortcuts must NOT fire while typing.
      const tag = (e.target as HTMLElement).tagName;
      const isEditable = (e.target as HTMLElement).isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || isEditable) return;

      if (e.key === 's' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleToggle();
      }
    }

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isExpanded, closeChat, handleToggle]);

  // Listen for custom event to open chat
  useEffect(() => {
    const handleOpenChat = () => expandStrip();
    window.addEventListener('open-sally-chat', handleOpenChat);
    return () => window.removeEventListener('open-sally-chat', handleOpenChat);
  }, [expandStrip]);

  const animLayout = openLayoutRef.current;
  const isFloat = animLayout === 'float';

  const isSideLayout = chatLayout === 'side';
  const sideModeWidthClass = chatLayout === 'split' ? 'w-full sm:w-1/2' : 'w-full';
  const panelClasses =
    chatLayout === 'float'
      ? floatClasses
      : `fixed right-0 top-0 h-full z-50 border-l border-border ${sideModeWidthClass}`;

  const panelStyle: React.CSSProperties | undefined = isSideLayout
    ? { width: `min(${sideWidth}px, 100vw)` }
    : undefined;

  return (
    <>
      {/* Backdrop — mobile always, float mode on desktop too */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={chatLayout === 'float' ? undefined : closeChat}
            className={`fixed inset-0 z-40 ${
              chatLayout === 'float' ? 'bg-black/20 backdrop-blur-[2px]' : 'bg-black/30 sm:hidden'
            }`}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded ? (
          <motion.div
            key="expanded"
            initial={isFloat ? { scale: 0.95, opacity: 0 } : { x: '100%' }}
            animate={isFloat ? { scale: 1, opacity: 1 } : { x: 0 }}
            exit={isFloat ? { scale: 0.95, opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{
              ...panelStyle,
              ...(chatLayout === 'float' && (floatOffset.x !== 0 || floatOffset.y !== 0)
                ? { marginLeft: floatOffset.x, marginTop: floatOffset.y }
                : {}),
            }}
            className={`${panelClasses} ${chatLayout === 'float' ? 'sally-float-glow' : 'bg-background'} flex flex-col overflow-hidden ${isDragging || isFloatDragging ? '' : 'transition-[width,inset,transform,border-radius,box-shadow] duration-300 ease-out'}`}
          >
            {/* Float glow inner wrapper — only in float mode */}
            <div className={chatLayout === 'float' ? 'sally-float-inner' : 'flex flex-col flex-1 min-h-0'}>
              {/* Drag handle — left edge, side mode only, desktop only */}
              {isSideLayout && (
                <div
                  onPointerDown={handleDragStart}
                  onPointerMove={handleDragMove}
                  onPointerUp={handleDragEnd}
                  onPointerCancel={handleDragEnd}
                  className="hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10 group/drag hover:bg-primary/10 active:bg-primary/20"
                >
                  <div className="absolute left-0.5 top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border group-hover/drag:bg-muted-foreground transition-colors" />
                </div>
              )}

              {/* Header — draggable in float mode */}
              <div
                className={`flex items-center justify-between h-14 px-4 border-b border-border shrink-0 ${chatLayout === 'float' ? 'cursor-grab active:cursor-grabbing' : ''}`}
                {...(chatLayout === 'float'
                  ? {
                      onPointerDown: handleFloatDragStart,
                      onPointerMove: handleFloatDragMove,
                      onPointerUp: handleFloatDragEnd,
                      onPointerCancel: handleFloatDragEnd,
                    }
                  : {})}
              >
                <div className="flex items-center gap-3">
                  <SallyOrb state={orbState} size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">SALLY</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  {/* Layout mode buttons — hidden on mobile */}
                  <div className="hidden sm:flex items-center gap-0.5 mr-1 border-r border-border pr-1.5">
                    {/* Side panel */}
                    <LayoutModeButton
                      active={chatLayout === 'side'}
                      onClick={() => setChatLayout('side')}
                      label="Side panel"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="15" y1="3" x2="15" y2="21" />
                      </svg>
                    </LayoutModeButton>

                    {/* Split view */}
                    <LayoutModeButton
                      active={chatLayout === 'split'}
                      onClick={() => setChatLayout('split')}
                      label="Split view"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <line x1="12" y1="3" x2="12" y2="21" />
                      </svg>
                    </LayoutModeButton>

                    {/* Full view */}
                    <LayoutModeButton
                      active={chatLayout === 'full'}
                      onClick={() => setChatLayout('full')}
                      label="Full view"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                      </svg>
                    </LayoutModeButton>
                  </div>

                  {/* Voice settings — authenticated users only */}
                  {userMode !== 'prospect' && <SallyVoiceSettings />}

                  {/* Keyboard hint */}
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-2xs font-mono text-muted-foreground bg-muted rounded border border-border">
                    esc
                  </kbd>

                  {/* Close button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={closeChat}
                    className="h-8 w-8"
                    aria-label="Close Sally (Esc)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </Button>
                </div>
              </div>

              {/* Chat — wrapped with VoiceProvider for voice session context */}
              <VoiceProvider>
                <SallyChat />
              </VoiceProvider>
            </div>
            {/* end float glow inner / flex wrapper */}
          </motion.div>
        ) : (
          /* Floating orb — bottom-right corner. Quiet by default; nerve net
             reveals on hover or during active states. Keyboard hint lives
             inside the orb (see SallyOrb) so we don't render a sibling chip. */
          !hideOrb && (
            <motion.div
              key="collapsed"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="fixed right-6 z-50 bottom-6"
            >
              <SallyOrb state={orbState} size="lg" onClick={expandStrip} hasUnread={hasUnreadAsync} showHint />
            </motion.div>
          )
        )}
      </AnimatePresence>
    </>
  );
}
