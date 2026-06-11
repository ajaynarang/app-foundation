'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, BookOpen, Search, X } from 'lucide-react';
import { cn } from '@app/ui';
import { ScrollArea } from '@app/ui/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@app/ui/components/ui/tooltip';

type DocsNavItem = {
  label: string;
  href: string;
  children?: DocsNavItem[];
};

type DocsNavSection = {
  label: string;
  items: DocsNavItem[];
};

// ─── API Docs navigation ────────────────────────────────────────────────────

const apiNavigation: DocsNavSection[] = [
  {
    label: 'Getting Started',
    items: [
      { label: 'Introduction', href: '/docs/getting-started/introduction' },
      { label: 'Quickstart', href: '/docs/getting-started/quickstart' },
      { label: 'Authentication', href: '/docs/getting-started/authentication' },
      { label: 'API Keys', href: '/docs/getting-started/api-keys' },
    ],
  },
  {
    label: 'Guides',
    items: [
      {
        label: 'AI Integrations',
        href: '/docs/api-guides/ai-integrations',
        children: [
          { label: 'ChatGPT', href: '/docs/api-guides/ai-integrations/chatgpt' },
          { label: 'Claude Desktop', href: '/docs/api-guides/ai-integrations/claude-desktop' },
          { label: 'Claude Connector', href: '/docs/api-guides/ai-integrations/claude-connector' },
          { label: 'Cursor', href: '/docs/api-guides/ai-integrations/cursor' },
          { label: 'MCP Clients', href: '/docs/api-guides/ai-integrations/mcp-clients' },
        ],
      },
    ],
  },
  {
    label: 'API Reference',
    items: [
      { label: 'Authentication', href: '/docs/api-reference/authentication' },
      { label: 'Error Codes', href: '/docs/api-reference/error-codes' },
      { label: 'API Playground', href: '/docs/api-playground' },
    ],
  },
  {
    label: 'Webhooks',
    items: [{ label: 'Webhook Events', href: '/docs/webhooks' }],
  },
  {
    label: 'Resources',
    items: [{ label: 'Support', href: '/docs/resources/support' }],
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function isPathUnderHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/');
}

function getSectionContainingPath(section: DocsNavSection, pathname: string): boolean {
  return section.items.some(
    (item) =>
      isPathUnderHref(pathname, item.href) ||
      (item.children?.some((child) => isPathUnderHref(pathname, child.href)) ?? false),
  );
}

function getExpandedKeys(sections: DocsNavSection[], pathname: string): Set<string> {
  const keys = new Set<string>();
  for (const section of sections) {
    for (const item of section.items) {
      if (
        item.children &&
        (isPathUnderHref(pathname, item.href) || item.children.some((child) => isPathUnderHref(pathname, child.href)))
      ) {
        keys.add(item.href);
      }
    }
  }
  return keys;
}

const COLLAPSED_KEY = 'docs-sidebar-collapsed';

const sectionAbbreviations: Record<string, string> = {
  'Getting Started': 'GS',
  Guides: 'GD',
  'API Reference': 'API',
  Webhooks: 'WH',
  Resources: 'RS',
};

function filterNavItem(item: DocsNavItem, query: string): DocsNavItem | null {
  const q = query.toLowerCase();
  if (item.label.toLowerCase().includes(q)) return item;
  if (item.children) {
    const filtered = item.children.map((child) => filterNavItem(child, query)).filter(Boolean) as DocsNavItem[];
    if (filtered.length > 0) return { ...item, children: filtered };
  }
  return null;
}

function filterNavigation(sections: DocsNavSection[], query: string): DocsNavSection[] {
  if (!query.trim()) return sections;
  return sections
    .map((section) => {
      const items = section.items.map((item) => filterNavItem(item, query)).filter(Boolean) as DocsNavItem[];
      return items.length > 0 ? { ...section, items } : null;
    })
    .filter(Boolean) as DocsNavSection[];
}

// ─── NavItem ────────────────────────────────────────────────────────────────

interface NavItemProps {
  item: DocsNavItem;
  pathname: string;
  expandedKeys: Set<string>;
  onToggle: (href: string) => void;
  depth?: number;
}

function NavItem({ item, pathname, expandedKeys, onToggle, depth = 0 }: NavItemProps) {
  const isActive = pathname === item.href;
  const isExpanded = expandedKeys.has(item.href);
  const hasChildren = item.children && item.children.length > 0;

  if (hasChildren) {
    return (
      <div>
        <button
          onClick={() => onToggle(item.href)}
          className={cn(
            'flex items-center justify-between w-full text-sm py-1.5 px-2 rounded-md transition-colors',
            'hover:text-foreground hover:bg-muted/50',
            depth > 0 && 'pl-4',
            isPathUnderHref(pathname, item.href) ? 'text-foreground font-medium' : 'text-muted-foreground',
          )}
        >
          <span>{item.label}</span>
          <ChevronRight
            className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200', isExpanded && 'rotate-90')}
          />
        </button>
        {isExpanded && item.children && (
          <div className="mt-0.5 ml-2 border-l border-border pl-2 space-y-0.5">
            {item.children.map((child) => (
              <NavItem
                key={child.href}
                item={child}
                pathname={pathname}
                expandedKeys={expandedKeys}
                onToggle={onToggle}
                depth={depth + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={cn(
        'block text-sm py-1.5 px-2 rounded-md transition-colors',
        'hover:text-foreground hover:bg-muted/50',
        depth > 0 && 'pl-3',
        isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
      )}
    >
      {item.label}
    </Link>
  );
}

// ─── DocsSidebar ────────────────────────────────────────────────────────────

export function DocsSidebar() {
  const pathname = usePathname() ?? '';
  const activeNavigation = apiNavigation;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => getExpandedKeys(activeNavigation, pathname));
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const filteredNavigation = useMemo(
    () => filterNavigation(activeNavigation, searchQuery),
    [searchQuery, activeNavigation],
  );

  const effectiveExpandedKeys = useMemo(() => {
    if (!searchQuery.trim()) return expandedKeys;
    const keys = new Set(expandedKeys);
    for (const section of filteredNavigation) {
      for (const item of section.items) {
        if (item.children && item.children.length > 0) {
          keys.add(item.href);
        }
      }
    }
    return keys;
  }, [searchQuery, expandedKeys, filteredNavigation]);

  const handleCollapse = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey && e.key === 'k') ||
        (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName))
      ) {
        e.preventDefault();
        if (isCollapsed) {
          handleCollapse();
          setTimeout(() => searchInputRef.current?.focus(), 350);
        } else {
          searchInputRef.current?.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isCollapsed, handleCollapse]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLLAPSED_KEY);
      if (stored === 'true') setIsCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      getExpandedKeys(activeNavigation, pathname).forEach((key) => next.add(key));
      return next;
    });
  }, [pathname, activeNavigation]);

  const handleToggle = (href: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search docs..."
            className="w-full h-8 pl-8 pr-8 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setSearchQuery('');
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          {searchQuery ? (
            <button
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ) : (
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[10px] text-muted-foreground border border-border rounded px-1 py-0.5 font-sans">
              ⌘K
            </kbd>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 py-2 px-4">
        {filteredNavigation.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2 py-4">No results found</p>
        ) : (
          <nav className="space-y-6">
            {filteredNavigation.map((section) => {
              const isSectionActive = getSectionContainingPath(section, pathname);
              return (
                <div key={section.label}>
                  <p
                    className={cn(
                      'text-xs font-semibold uppercase tracking-wider mb-2 px-2',
                      isSectionActive ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {section.label}
                  </p>
                  <div className="space-y-0.5">
                    {section.items.map((item) => (
                      <NavItem
                        key={item.href}
                        item={item}
                        pathname={pathname}
                        expandedKeys={effectiveExpandedKeys}
                        onToggle={handleToggle}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <TooltipProvider delayDuration={0}>
      {/* Mobile hamburger trigger */}
      <div className="md:hidden fixed bottom-4 left-4 z-50">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="flex items-center justify-center h-11 w-11 rounded-full bg-background border border-border shadow-md text-foreground hover:bg-muted transition-colors"
          aria-label="Open navigation"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileOpen(false)} />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-background border-r border-border transition-transform duration-300 ease-in-out md:hidden',
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Documentation</span>
          <button
            onClick={() => setIsMobileOpen(false)}
            className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-muted transition-colors text-muted-foreground"
            aria-label="Close navigation"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col flex-shrink-0 border-r border-border bg-background sticky top-14 h-[calc(100vh-3.5rem)] transition-all duration-300 ease-in-out',
          isCollapsed ? 'w-16' : 'w-64',
        )}
      >
        {/* Header with collapse toggle */}
        <div
          className={cn(
            'flex items-center h-10 border-b border-border',
            isCollapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {isCollapsed ? (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={handleCollapse}
                  className="flex items-center justify-center p-1.5 rounded-md hover:bg-muted transition-colors"
                  title="Expand sidebar"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Expand docs sidebar
              </TooltipContent>
            </Tooltip>
          ) : (
            <>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Docs</span>
              <button
                onClick={handleCollapse}
                className="flex items-center justify-center p-1.5 rounded-md hover:bg-muted transition-colors"
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </button>
            </>
          )}
        </div>

        {/* Expanded: nav */}
        {!isCollapsed && sidebarContent}

        {/* Collapsed: section initials */}
        {isCollapsed && (
          <div className="flex-1 py-4 px-2 space-y-2 overflow-y-auto">
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    handleCollapse();
                    setTimeout(() => searchInputRef.current?.focus(), 350);
                  }}
                  className="flex items-center justify-center h-9 w-full rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mb-2"
                >
                  <Search className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                Search docs
              </TooltipContent>
            </Tooltip>
            {activeNavigation.map((section) => {
              const isSectionActive = getSectionContainingPath(section, pathname);
              const firstItemHref = section.items[0]?.href ?? '/docs';
              const abbrev = sectionAbbreviations[section.label] ?? section.label.charAt(0);
              return (
                <Tooltip key={section.label} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <Link
                      href={firstItemHref}
                      className={cn(
                        'flex items-center justify-center h-9 w-full rounded-md text-[10px] font-bold uppercase transition-colors',
                        isSectionActive
                          ? 'bg-black text-white dark:bg-white dark:text-black'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      {abbrev}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {section.label}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        {/* Bottom expand button when collapsed */}
        {isCollapsed && (
          <div className="border-t border-border px-2 py-2">
            <button
              onClick={handleCollapse}
              className="flex items-center justify-center w-full p-1.5 rounded-md hover:bg-muted transition-colors"
              title="Expand sidebar"
            >
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export default DocsSidebar;
