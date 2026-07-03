'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useAuthStore } from '@/features/auth';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { useQuery } from '@tanstack/react-query';
import { useRecents, ICON_MAP } from './use-recents';
import { isAddOnFeature } from '@app/shared-types';
import { searchEntities } from '@appshore/web-core/shared/lib/search';
import { defaultProviders, searchResultsToPaletteItems } from './command-registry';
import type { PaletteItem } from './command-registry';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaletteGroup {
  heading: string;
  items: PaletteItem[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Simple word-based fuzzy matching.
 * Every word in the query must appear in at least one of: label, description, keywords.
 */
function matchesQuery(item: PaletteItem, query: string): boolean {
  if (!query.trim()) return true;

  const haystack = [item.label, item.description ?? '', ...(item.keywords ?? [])].join(' ').toLowerCase();

  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((word) => haystack.includes(word));
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePaletteItems(query: string): PaletteGroup[] {
  const { user } = useAuthStore();
  const role = user?.role;
  const { hasFeature } = usePlan();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const push = useCallback((href: string) => routerRef.current.push(href), []);
  const pathname = usePathname();
  const { recents } = useRecents(role);

  const debouncedQuery = useDebounce(query, 250);

  const { data: searchResults } = useQuery({
    queryKey: ['palette-search', debouncedQuery],
    queryFn: () => searchEntities(debouncedQuery),
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  return useMemo(() => {
    // 1. Build provider context
    const ctx = {
      role,
      hasFeature,
      pathname,
      router: { push },
    };

    // 2. Collect items from all providers
    let allItems: PaletteItem[] = [];
    for (const provider of defaultProviders) {
      allItems = allItems.concat(provider(ctx, query));
    }

    // 3. Filter by role
    allItems = allItems.filter((item) => {
      if (!item.roles || item.roles.length === 0) return true;
      if (!role) return false;
      return item.roles.includes(role);
    });

    // 4. Handle entitlement gating:
    //    - Add-on features the user doesn't have → show with sparkle ("add-on" badge)
    //    - Plan-tier features the user doesn't have → hide entirely (same as sidebar)
    allItems = allItems.reduce<PaletteItem[]>((acc, item) => {
      const keys = item.entitlement ? [item.entitlement] : item.entitlements?.length ? item.entitlements : [];

      if (keys.length === 0) {
        acc.push(item);
        return acc;
      }

      const hasAccess = keys.some(hasFeature);
      if (hasAccess) {
        acc.push(item);
        return acc;
      }

      // User lacks access — is it an add-on they can purchase?
      const isAvailableAddOn = keys.some(isAddOnFeature);
      if (isAvailableAddOn) {
        acc.push({ ...item, isGated: true });
      }
      // else: plan-tier feature they can't access → hide entirely

      return acc;
    }, []);

    // 5. Filter by query
    allItems = allItems.filter((item) => matchesQuery(item, query));

    // 6. Sort by priority within each kind (lower = higher in list)
    const sortByPriority = (a: PaletteItem, b: PaletteItem) => (a.priority ?? 0) - (b.priority ?? 0);

    // 7. Build groups
    const groups: PaletteGroup[] = [];

    // Recent items — only when query is empty
    if (!query.trim() && recents.length > 0) {
      const recentItems: PaletteItem[] = recents.slice(0, 5).map((recent) => ({
        id: `recent:${recent.href}`,
        label: recent.label,
        icon: ICON_MAP[recent.iconName] ?? Clock,
        kind: 'recent' as const,
        onSelect: () => push(recent.href),
        priority: 0,
      }));

      groups.push({ heading: 'Recent', items: recentItems });
    }

    // Quick Actions
    const actions = allItems.filter((item) => item.kind === 'action').sort(sortByPriority);
    if (actions.length > 0) {
      groups.push({ heading: 'Quick Actions', items: actions });
    }

    // Entity search results — insert before Navigation
    if (searchResults?.length) {
      const entityItems = searchResultsToPaletteItems(searchResults, { push });
      const navIndex = groups.findIndex((g) => g.heading === 'Navigation');
      const insertAt = navIndex >= 0 ? navIndex : groups.length;
      groups.splice(insertAt, 0, { heading: 'Results', items: entityItems });
    }

    // Navigation
    const navigation = allItems.filter((item) => item.kind === 'navigation').sort(sortByPriority);
    if (navigation.length > 0) {
      groups.push({ heading: 'Navigation', items: navigation });
    }

    return groups;
  }, [query, role, pathname, hasFeature, recents, push, searchResults]);
}
