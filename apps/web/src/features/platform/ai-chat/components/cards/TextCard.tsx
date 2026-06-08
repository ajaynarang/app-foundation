'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { TextCardData } from '../../engine/types';

/**
 * Generic text / markdown card — the one built-in card in the empty starter
 * catalog. Renders an optional title plus a markdown body. Register additional
 * cards in `RichCardRenderer` as your product grows.
 */
export function TextCard({ data }: { data: Record<string, unknown> }) {
  const card = data as unknown as TextCardData;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
      {card.title && <p className="text-sm font-medium text-foreground">{card.title}</p>}
      {card.body && (
        <div className="sally-markdown text-sm leading-relaxed text-muted-foreground">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{card.body}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
