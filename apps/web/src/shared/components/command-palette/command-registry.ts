import type { LucideIcon } from 'lucide-react';
import { STORAGE_KEYS } from '@/shared/constants';
import { ClipboardList, FileText, Moon, Package, Plus, Receipt, Sun, Users, Wallet } from 'lucide-react';
import { apiClient } from '@/shared/lib/api';
import type { UserRole, NavigationItem, NavItem } from '@/shared/lib/navigation';
import { getNavigationForRole, getSubPanelSections } from '@/shared/lib/navigation';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PaletteItemKind = 'navigation' | 'action' | 'entity' | 'recent';

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  kind: PaletteItemKind;
  keywords?: string[];
  onSelect: () => void;
  entitlement?: string;
  entitlements?: string[];
  roles?: UserRole[];
  /** True when the item exists but the tenant lacks the entitlement */
  isGated?: boolean;
  /** Lower number = higher in results (default 0) */
  priority?: number;
}

export interface PaletteProviderContext {
  role: UserRole | undefined;
  hasFeature: (key: string) => boolean;
  pathname: string;
  router: { push: (href: string) => void };
}

export type PaletteProvider = (ctx: PaletteProviderContext, query: string) => PaletteItem[];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNavItem(item: NavigationItem): item is NavItem {
  return !('type' in item && item.type === 'separator');
}

/** Append entityType + entityId search params to a href for deep-linking */
function appendEntityParams(href: string, entityType: string, entityId: string): string {
  const url = new URL(href, 'http://placeholder');
  url.searchParams.set('entityType', entityType);
  url.searchParams.set('entityId', entityId);
  return `${url.pathname}${url.search}`;
}

// ---------------------------------------------------------------------------
// 1. Navigation Provider
// ---------------------------------------------------------------------------

export const navigationProvider: PaletteProvider = (ctx, _query) => {
  const { role, router } = ctx;
  if (!role) return [];

  const items: PaletteItem[] = [];

  // --- Main nav items ---
  const navItems = getNavigationForRole(role).filter(isNavItem);
  for (const nav of navItems) {
    // Skip items that open sub-panels — we flatten those below
    if (nav.subPanel) continue;

    items.push({
      id: `nav:${nav.href}`,
      label: nav.label,
      icon: nav.icon,
      kind: 'navigation',
      keywords: [nav.label.toLowerCase()],
      onSelect: () => router.push(nav.href),
      entitlement: nav.entitlement,
      entitlements: nav.entitlements,
      roles: nav.roles,
      // isGated is computed centrally by usePaletteItems
      priority: 0,
    });
  }

  // --- Settings sub-panel items ---
  const settingsSections = getSubPanelSections('settings', role);
  for (const section of settingsSections) {
    for (const item of section.items) {
      // Skip external links (e.g. API Docs) — they open new tabs, not in-app nav
      if ('external' in item && item.external) continue;

      items.push({
        id: `nav:${item.href}`,
        label: item.label,
        description: section.label ? `Settings > ${section.label}` : 'Settings',
        icon: item.icon,
        kind: 'navigation',
        keywords: ['settings', section.label.toLowerCase(), item.label.toLowerCase()].filter(Boolean),
        onSelect: () => router.push(item.href),
        entitlement: item.entitlement,
        entitlements: item.entitlements,
        // isGated is computed centrally by usePaletteItems
        priority: 10,
      });
    }
  }

  return items;
};

// ---------------------------------------------------------------------------
// 2. Quick Actions Provider
// ---------------------------------------------------------------------------

export const quickActionsProvider: PaletteProvider = (ctx, _query) => {
  const { role, router, hasFeature: _hasFeature } = ctx;
  if (!role) return [];

  const actions: PaletteItem[] = [];

  // Invite Member — available to admins
  if (['ADMIN', 'OWNER'].includes(role)) {
    actions.push({
      id: 'action:invite-member',
      label: 'Invite Member',
      description: 'Invite someone to your workspace',
      icon: Plus,
      kind: 'action',
      keywords: ['invite', 'member', 'user', 'add', 'team'],
      onSelect: () => router.push('/settings/members'),
      priority: -10,
    });
  }

  // Billing — available to admins
  if (['ADMIN', 'OWNER'].includes(role)) {
    actions.push({
      id: 'action:billing',
      label: 'Billing & Plans',
      description: 'Manage your subscription and usage',
      icon: FileText,
      kind: 'action',
      keywords: ['billing', 'plan', 'subscription', 'usage'],
      onSelect: () => router.push('/settings/billing'),
      priority: -5,
    });
  }

  // Toggle Theme — available to all roles
  actions.push({
    id: 'action:toggle-theme',
    label: 'Toggle Theme',
    description: 'Switch between light and dark mode',
    icon: typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? Sun : Moon,
    kind: 'action',
    keywords: ['theme', 'dark', 'light', 'mode', 'toggle', 'appearance'],
    onSelect: () => {
      const html = document.documentElement;
      const isDark = html.classList.contains('dark');
      html.classList.toggle('dark', !isDark);
      try {
        localStorage.setItem(STORAGE_KEYS.THEME, isDark ? 'light' : 'dark');
      } catch {
        // Storage unavailable
      }
    },
    priority: 20,
  });

  return actions;
};

// ---------------------------------------------------------------------------
// Default providers (order matters — first provider's items appear first)
// ---------------------------------------------------------------------------

export const defaultProviders: PaletteProvider[] = [navigationProvider, quickActionsProvider];

// ---------------------------------------------------------------------------
// Entity Search
// ---------------------------------------------------------------------------

const ENTITY_ICONS: Record<string, LucideIcon> = {
  load: ClipboardList,
  driver: Users,
  invoice: Receipt,
  customer: Package,
  settlement: Wallet,
};

export interface SearchApiResult {
  type: string;
  id: string;
  label: string;
  description: string;
  href: string;
}

export async function searchEntities(query: string): Promise<SearchApiResult[]> {
  if (!query || query.length < 2) return [];
  return apiClient<SearchApiResult[]>(`/search?q=${encodeURIComponent(query)}&limit=8`);
}

export function searchResultsToPaletteItems(
  results: SearchApiResult[],
  router: { push: (href: string) => void },
): PaletteItem[] {
  return results.map((r) => ({
    id: `entity:${r.type}:${r.id}`,
    label: r.label,
    description: r.description,
    icon: ENTITY_ICONS[r.type] ?? Package,
    kind: 'entity' as PaletteItemKind,
    onSelect: () => router.push(appendEntityParams(r.href, r.type, r.id)),
    priority: 5,
  }));
}
