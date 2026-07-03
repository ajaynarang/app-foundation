'use client';

import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { ScrollArea } from '@app/ui/components/ui/scroll-area';
import { useAssistantStore } from '../store';
import { AssistantMessage } from './AssistantMessage';
import { AssistantActionBar } from './AssistantActionBar';
import { AssistantInput } from './AssistantInput';
import { AssistantOrb } from './AssistantOrb';
import { formatRelativeTime } from '@appshore/web-core/shared/lib/utils/formatters';

interface AssistantChatProps {
  /**
   * When true, suppress internal chrome that would duplicate what the
   * parent surface already provides:
   *   - the Recent-conversations toggle (ActivityFeed lists them already)
   *   - the in-history Back button + View-only badge (the parent header
   *     owns the back action)
   * Pass from surfaces like VoidChat (home); leave off for the floating
   * Assistant strip which has no outer chrome.
   */
  embedded?: boolean;
}

export function AssistantChat({ embedded = false }: AssistantChatProps) {
  const {
    messages,
    orbState,
    pastConversations,
    isViewingHistory,
    viewedMessages,
    isLoadingHistory,
    sendMessage,
    clearSession,
    expandStrip,
    loadHistory,
    viewConversation,
    clearView,
  } = useAssistantStore();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [showRecents, setShowRecents] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, viewedMessages]);

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const hasOnlyGreeting = messages.length <= 1;
  const displayMessages = isViewingHistory ? viewedMessages : messages;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Messages area with subtle dot grid */}
      <ScrollArea className="flex-1">
        <div className="relative">
          {/* Command center dot grid */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.06]"
            style={{
              backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          <div className="relative p-4 space-y-4">
            {/* View-only banner — only when not embedded (floating strip needs it) */}
            {isViewingHistory && !embedded && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearView}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                  Back
                </Button>
                <span className="text-2xs text-muted-foreground">View-only</span>
              </motion.div>
            )}

            {/* Empty state: centered orb with "How can I help?" */}
            {!isViewingHistory && hasOnlyGreeting && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center justify-center py-10"
              >
                <div className="mb-4">
                  <AssistantOrb state="idle" size="lg" alwaysAmbient />
                </div>
                <p className="text-sm text-muted-foreground">How can I help?</p>
              </motion.div>
            )}

            {/* Recent conversations toggle (empty state) */}
            {!embedded && !isViewingHistory && hasOnlyGreeting && pastConversations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="space-y-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRecents((prev) => !prev)}
                  className="w-full flex items-center gap-2 h-7 px-1 text-muted-foreground hover:text-foreground"
                >
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-2xs uppercase tracking-wider shrink-0 flex items-center gap-1">
                    Recent ({pastConversations.length})
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      className={`transition-transform duration-200 ${showRecents ? 'rotate-180' : ''}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </Button>

                <AnimatePresence>
                  {showRecents && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden space-y-1"
                    >
                      {pastConversations.slice(0, 5).map((conv, i) => (
                        <motion.div
                          key={conv.conversationId}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                        >
                          <Button
                            variant="ghost"
                            onClick={() => viewConversation(conv.conversationId)}
                            className="w-full flex items-center justify-between px-3 py-2 h-auto rounded-lg text-left"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-foreground truncate">
                                {conv.title || 'Untitled conversation'}
                              </p>
                              <p className="text-2xs text-muted-foreground">{conv.messageCount} messages</p>
                            </div>
                            <span className="text-2xs text-muted-foreground shrink-0 ml-2">
                              {formatRelativeTime(conv.lastMessageAt)}
                            </span>
                          </Button>
                        </motion.div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {/* Loading history spinner */}
            {isLoadingHistory && (
              <div className="flex justify-center py-4">
                <div className="flex items-center gap-[3px] h-6">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] bg-muted-foreground rounded-full"
                      animate={{ height: ['6px', '14px', '6px'] }}
                      transition={{
                        duration: 0.6,
                        repeat: Infinity,
                        ease: 'easeInOut',
                        delay: i * 0.1,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {displayMessages.map((message) => (
              <AssistantMessage key={message.id} message={message} />
            ))}

            {/* Thinking: animated waveform */}
            <AnimatePresence>
              {!isViewingHistory && orbState === 'thinking' && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex justify-start"
                >
                  <div className="pl-4 relative">
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] rounded-full bg-gray-300 dark:bg-gray-700" />
                    <div className="flex items-center gap-[3px] h-6">
                      {[0, 1, 2, 3, 4].map((i) => (
                        <motion.div
                          key={i}
                          className="w-[3px] bg-muted-foreground rounded-full"
                          animate={{ height: ['6px', '18px', '6px'] }}
                          transition={{
                            duration: 0.8,
                            repeat: Infinity,
                            ease: 'easeInOut',
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inline "start new" — appears after first message. Hidden when
                embedded because the parent surface (VoidChat) already has a
                 New-conversation button in its sticky header. */}
            {!embedded && !isViewingHistory && messages.length >= 1 && orbState !== 'thinking' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="flex justify-center pt-2"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearSession();
                    expandStrip();
                  }}
                  className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground py-1 px-3 rounded-full h-auto"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  Start new conversation
                </Button>
              </motion.div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>
      </ScrollArea>

      {/* Action bar + Input — hidden when viewing history */}
      {!isViewingHistory && (
        <div className="shrink-0">
          <AssistantActionBar onSelect={(text) => sendMessage(text, 'text')} />
          <div className="border-t border-border/30">
            <AssistantInput />
          </div>
        </div>
      )}
    </div>
  );
}
