'use client';

import { motion } from 'framer-motion';
import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@app/ui/components/ui/button';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import type { ChatMessage } from '../engine/types';
import { RichCardRenderer } from './cards/RichCardRenderer';

function VoiceBadge() {
  return (
    <span className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-[9px] px-1.5 py-0.5 rounded-full">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      </svg>
      Voice
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleCopy}
      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label="Copy message"
      title="Copy message"
    >
      {copied ? (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </Button>
  );
}

export function AssistantMessage({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  const isVoice = message.inputMode === 'voice';

  return (
    <motion.div
      initial={{ opacity: 0, x: isUser ? 16 : -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div className={`max-w-[85%] space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* Message content */}
        {isUser ? (
          /* User: frosted glass pill */
          <div
            className={`backdrop-blur-sm bg-muted/80 border border-border/50 rounded-2xl px-4 py-2.5 ${
              isVoice ? 'border-l-2 border-l-foreground/30' : ''
            }`}
          >
            {isVoice && (
              <span className="block mb-1">
                <VoiceBadge />
              </span>
            )}
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">{message.content}</p>
          </div>
        ) : (
          /* Assistant: accent line with markdown + copy button */
          <div className="relative pl-4 group/msg">
            <div
              className={`absolute left-0 top-0 bottom-0 w-[2px] rounded-full ${
                isVoice ? 'bg-foreground/60' : 'bg-border'
              }`}
            />
            {isVoice && (
              <span className="block mb-1">
                <VoiceBadge />
              </span>
            )}
            <div className="assistant-markdown text-sm leading-relaxed text-foreground">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
            {/* Voice playback — future: capture TTS audio to IndexedDB for replay */}
            {message.content && (
              <div className="flex justify-end mt-1">
                <CopyButton text={message.content} />
              </div>
            )}
          </div>
        )}

        {/* Rich card */}
        {message.card && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`w-full ${!isUser ? 'pl-4' : ''}`}
          >
            <RichCardRenderer card={message.card} />
          </motion.div>
        )}

        {/* Action result — inline, no badge */}
        {message.action && (
          <div className={`flex items-center gap-1.5 text-xs ${!isUser ? 'pl-4' : ''}`}>
            {message.action.success ? (
              <>
                <svg
                  className="w-3.5 h-3.5 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
                <span className="text-muted-foreground">{message.action.message}</span>
              </>
            ) : (
              <>
                <svg
                  className={`w-3.5 h-3.5 ${SEMANTIC_COLORS.critical.text}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
                <span className={SEMANTIC_COLORS.critical.text}>{message.action.message}</span>
              </>
            )}
          </div>
        )}

        {/* Timestamp — visible on hover */}
        <p
          className={`text-2xs px-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${isUser ? 'text-right' : 'text-left'} ${!isUser ? 'pl-4' : ''}`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </motion.div>
  );
}
