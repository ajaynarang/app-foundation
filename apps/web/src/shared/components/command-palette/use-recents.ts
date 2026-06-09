'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  ClipboardList,
  FileText,
  Package,
  Receipt,
  Settings,
  Truck,
  User,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { getNavigationForRole, type NavItem, type UserRole } from '@/shared/lib/navigation';
import { STORAGE_KEYS } from '@/shared/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RecentItem {
  href: string;
  label: string;
  iconName: string; // Lucide icon name — serializable to localStorage
  // 'page' for nav destinations; add your own entity types alongside the
  // ENTITY_PATTERNS you register below.
  type: 'page' | (string & {});
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Icon map — maps serialized icon names back to Lucide components
// ---------------------------------------------------------------------------

export const ICON_MAP: Record<string, LucideIcon> = {
  ClipboardList,
  FileText,
  Package,
  Receipt,
  Settings,
  Truck,
  User,
  Users,
  Wallet,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_RECENTS = 8;
const SKIP_ROUTES = ['/', '/login', '/track'];

function storageKey(role: UserRole | undefined): string {
  return role ? STORAGE_KEYS.cmdPaletteRecents(role) : STORAGE_KEYS.CMD_PALETTE_RECENTS_PREFIX;
}

// ---------------------------------------------------------------------------
// Entity pattern matching
// ---------------------------------------------------------------------------

interface EntityPattern {
  pattern: RegExp;
  type: RecentItem['type'];
  labelPrefix: string;
  iconName: string;
}

// Register URL patterns for your own entity detail pages here so the command
// palette can surface recently-visited records. Example:
//   { pattern: /\/widgets\/([^/]+)$/, type: 'widget', labelPrefix: 'Widget #', iconName: 'Box' },
const ENTITY_PATTERNS: EntityPattern[] = [];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readRecents(role: UserRole | undefined): RecentItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(role));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecents(role: UserRole | undefined, items: RecentItem[]): void {
  try {
    localStorage.setItem(storageKey(role), JSON.stringify(items));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function matchEntity(pathname: string): { type: RecentItem['type']; label: string; iconName: string } | null {
  for (const ep of ENTITY_PATTERNS) {
    const match = pathname.match(ep.pattern);
    if (match) {
      return {
        type: ep.type,
        label: `${ep.labelPrefix}${match[1]}`,
        iconName: ep.iconName,
      };
    }
  }
  return null;
}

function findNavItem(pathname: string, role: UserRole | undefined): NavItem | undefined {
  const items = getNavigationForRole(role).filter((i): i is NavItem => !('type' in i));
  // Match longest href first so nested routes don't collapse into their parent
  const sorted = [...items].sort((a, b) => b.href.length - a.href.length);
  for (const item of sorted) {
    if (item.exact) {
      if (pathname === item.href) return item;
      continue;
    }
    if (pathname === item.href || pathname.startsWith(item.href + '/')) {
      return item;
    }
  }
  return undefined;
}

function iconComponentToName(icon: LucideIcon): string {
  // LucideIcon displayName is the PascalCase name (e.g. "ClipboardList")
  return icon.displayName ?? 'FileText';
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRecents(role: UserRole | undefined): {
  recents: RecentItem[];
  clearRecents: () => void;
} {
  const pathname = usePathname();
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const initializedRef = useRef(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    setRecents(readRecents(role));
    initializedRef.current = true;
  }, [role]);

  // Track pathname changes
  useEffect(() => {
    if (!initializedRef.current) return;
    if (!pathname) return;
    if (SKIP_ROUTES.some((r) => pathname === r || pathname.startsWith(r + '/'))) return;

    // Determine label, icon, and type
    const entity = matchEntity(pathname);
    let label: string;
    let iconName: string;
    let type: RecentItem['type'];

    if (entity) {
      label = entity.label;
      iconName = entity.iconName;
      type = entity.type;
    } else {
      const navItem = findNavItem(pathname, role);
      if (!navItem) return; // Unknown route — don't track
      label = navItem.label;
      iconName = iconComponentToName(navItem.icon);
      type = 'page';
    }

    setRecents((prev) => {
      const now = Date.now();
      const newItem: RecentItem = { href: pathname, label, iconName, type, timestamp: now };
      // Remove existing entry with same href, then prepend
      const filtered = prev.filter((r) => r.href !== pathname);
      const updated = [newItem, ...filtered].slice(0, MAX_RECENTS);
      writeRecents(role, updated);
      return updated;
    });
  }, [pathname, role]);

  const clearRecents = useCallback(() => {
    setRecents([]);
    try {
      localStorage.removeItem(storageKey(role));
    } catch {
      // ignore
    }
  }, [role]);

  return { recents, clearRecents };
}
