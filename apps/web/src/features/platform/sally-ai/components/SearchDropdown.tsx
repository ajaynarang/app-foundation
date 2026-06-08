'use client';

import { useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClipboardList, Users, Receipt, Package, Wallet, type LucideIcon } from 'lucide-react';
import type { SearchApiResult } from '@/shared/lib/search';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENTITY_ICONS: Record<string, LucideIcon> = {
  load: ClipboardList,
  driver: Users,
  invoice: Receipt,
  customer: Package,
  settlement: Wallet,
};

const ENTITY_LABELS: Record<string, string> = {
  load: 'Loads',
  driver: 'Drivers',
  invoice: 'Invoices',
  customer: 'Customers',
  settlement: 'Settlements',
};

/** Order in which entity groups should appear */
const ENTITY_ORDER = ['load', 'driver', 'invoice', 'customer', 'settlement'];

const STAGGER_DELAY = 0.04;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchDropdownProps {
  results: SearchApiResult[];
  query: string;
  selectedIndex: number;
  onSelect: (result: SearchApiResult) => void;
  onHover: (index: number) => void;
  visible: boolean;
}

interface GroupedResults {
  type: string;
  label: string;
  icon: LucideIcon;
  items: SearchApiResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Group results by entity type, maintaining canonical order */
function groupResults(results: SearchApiResult[]): GroupedResults[] {
  const map = new Map<string, SearchApiResult[]>();

  for (const r of results) {
    const existing = map.get(r.type);
    if (existing) {
      existing.push(r);
    } else {
      map.set(r.type, [r]);
    }
  }

  // Sort by ENTITY_ORDER, then any unknown types at the end
  return Array.from(map.entries())
    .sort(([a], [b]) => {
      const ai = ENTITY_ORDER.indexOf(a);
      const bi = ENTITY_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    })
    .map(([type, items]) => ({
      type,
      label: ENTITY_LABELS[type] ?? type,
      icon: ENTITY_ICONS[type] ?? Package,
      items,
    }));
}

/** Highlight the matched portion of text by wrapping it in <strong> */
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const splitRegex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(splitRegex);
  // After split with a capture group, odd indices are the captured matches
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-semibold text-foreground">
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchDropdown({ results, query, selectedIndex, onSelect, onHover, visible }: SearchDropdownProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex < 0) return;
    const el = listRef.current?.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const grouped = useMemo(() => groupResults(results), [results]);

  const handleItemClick = useCallback(
    (result: SearchApiResult) => {
      onSelect(result);
    },
    [onSelect],
  );

  if (!visible || results.length === 0) return null;

  let flatIndex = 0;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-border bg-card/95 shadow-lg backdrop-blur-md"
          style={{ top: 'calc(100% + 6px)' }}
        >
          <div ref={listRef} className="max-h-[320px] overflow-y-auto overscroll-contain py-1" role="listbox">
            {grouped.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div key={group.type}>
                  {/* Group header */}
                  <div className="flex items-center gap-2 px-3 py-1.5">
                    <GroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      {group.label}
                    </span>
                  </div>

                  {/* Group items */}
                  {group.items.map((item) => {
                    const currentIndex = flatIndex++;
                    const isSelected = currentIndex === selectedIndex;

                    return (
                      <motion.div
                        key={`${item.type}:${item.id}`}
                        data-index={currentIndex}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.2,
                          delay: currentIndex * STAGGER_DELAY,
                        }}
                        role="option"
                        aria-selected={isSelected}
                        onClick={() => handleItemClick(item)}
                        onMouseEnter={() => onHover(currentIndex)}
                        className={`mx-1 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors ${
                          isSelected ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-foreground">
                            <HighlightMatch text={item.label} query={query} />
                          </p>
                          {item.description && (
                            <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* Footer with keyboard hints */}
          <div className="flex items-center gap-3 border-t border-border px-3 py-1.5">
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                &uarr;&darr;
              </kbd>
              navigate
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">
                &crarr;
              </kbd>
              open
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px]">esc</kbd>
              dismiss
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
