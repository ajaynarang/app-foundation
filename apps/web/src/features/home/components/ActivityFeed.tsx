'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight,
  ClipboardList,
  FileText,
  Package,
  Receipt,
  Truck,
  User,
  Users,
  Wallet,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@sally/ui/components/ui/button';
import { useSallyStore } from '@/features/platform/sally-ai/store';
import { useAuthStore } from '@/features/auth';
import { useRecents } from '@/shared/components/command-palette/use-recents';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ROWS = 6;
const STAGGER_DELAY = 0.04;

// Icon map for entity rows — mirrors command-palette's ICON_MAP so behavior stays
// consistent between the home surface and ⌘K.
const ENTITY_ICON: Record<string, LucideIcon> = {
  load: ClipboardList,
  driver: User,
  vehicle: Truck,
  customer: Users,
  invoice: Receipt,
  settlement: Wallet,
  page: FileText,
};

const ENTITY_KIND_LABEL: Record<string, string> = {
  load: 'Load',
  driver: 'Driver',
  vehicle: 'Vehicle',
  customer: 'Customer',
  invoice: 'Invoice',
  settlement: 'Settlement',
  page: 'Page',
};

// ── Unified item shape ───────────────────────────────────────────────────────

interface UnifiedItem {
  key: string;
  kind: 'sally' | 'load' | 'driver' | 'vehicle' | 'customer' | 'invoice' | 'settlement' | 'page';
  title: string;
  subtitle?: string;
  timestamp: number;
  onActivate: () => void;
}

// ── Type chip ────────────────────────────────────────────────────────────────

function TypeChip({ kind }: { kind: UnifiedItem['kind'] }) {
  const Icon = kind === 'sally' ? Sparkles : (ENTITY_ICON[kind] ?? Package);
  const label = kind === 'sally' ? 'Sally' : (ENTITY_KIND_LABEL[kind] ?? 'Item');

  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground shrink-0"
      aria-label={label}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

// ── Conversation title helpers ───────────────────────────────────────────────

const TITLE_MAX = 48;

function deriveSallyTitle(conv: { title: string | null; firstUserMessage?: string | null }): string {
  if (conv.title) return conv.title;
  const preview = conv.firstUserMessage?.trim();
  if (preview) {
    return preview.length > TITLE_MAX ? `${preview.slice(0, TITLE_MAX)}…` : preview;
  }
  return 'Untitled conversation';
}

// ── Row ──────────────────────────────────────────────────────────────────────

function UnifiedRow({ item, index }: { item: UnifiedItem; index: number }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * STAGGER_DELAY, ease: 'easeOut' }}
      onClick={item.onActivate}
      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50"
      type="button"
    >
      <TypeChip kind={item.kind} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
        {item.subtitle && <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{item.subtitle}</p>}
      </div>
    </motion.button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ActivityFeed() {
  const pastConversations = useSallyStore((s) => s.pastConversations);
  const viewConversation = useSallyStore((s) => s.viewConversation);
  const user = useAuthStore((s) => s.user);
  const { recents: entityRecents } = useRecents(user?.role);
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

  const items = useMemo<UnifiedItem[]>(() => {
    const sallyItems: UnifiedItem[] = pastConversations.map((conv) => ({
      key: `sally:${conv.conversationId}`,
      kind: 'sally' as const,
      title: deriveSallyTitle(conv),
      subtitle: `${conv.messageCount} ${conv.messageCount === 1 ? 'message' : 'messages'} · ${formatRelativeTime(conv.lastMessageAt)}`,
      timestamp: new Date(conv.lastMessageAt).getTime(),
      onActivate: () => viewConversation(conv.conversationId),
    }));

    // Skip `page` entries — detail entity visits are what feel like "recents"
    // in this surface; bare page visits are already covered by the top nav.
    const entityItems: UnifiedItem[] = entityRecents
      .filter((r) => r.type !== 'page')
      .map((r) => ({
        key: `entity:${r.href}`,
        kind: r.type,
        title: r.label,
        subtitle: formatRelativeTime(new Date(r.timestamp).toISOString()),
        timestamp: r.timestamp,
        onActivate: () => router.push(r.href),
      }));

    return [...sallyItems, ...entityItems].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_ROWS);
  }, [pastConversations, entityRecents, viewConversation, router]);

  if (items.length === 0) return null;

  return (
    // Mirror SallyInput's home root (max-w-3xl + px-4 sm:px-0) so the expanded
    // list and the input above it share the exact same visual axis and width.
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-0">
      <div className="flex flex-col items-center gap-3">
        {/* Single persistent toggle — chevron rotation is the open/closed state.
            Same position in both states = no horizontal jump, just vertical reveal. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="group h-auto gap-1.5 rounded-full px-3 py-1.5 text-xs font-normal text-muted-foreground/70 hover:text-foreground hover:bg-muted/40"
        >
          <span>Recent</span>
          <span className="text-muted-foreground/40">·</span>
          <span>{items.length}</span>
          <ChevronRight
            className={`h-3 w-3 transition-transform duration-200 ${
              expanded ? 'rotate-90' : 'group-hover:translate-x-0.5'
            }`}
          />
        </Button>

        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="list"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
              className="w-full overflow-hidden"
            >
              <div className="space-y-0.5 pb-1">
                {items.map((item, index) => (
                  <UnifiedRow key={item.key} item={item} index={index} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
