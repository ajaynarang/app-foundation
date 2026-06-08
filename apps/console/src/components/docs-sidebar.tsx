'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, BookOpen, Search, X, Code2, BookMarked } from 'lucide-react';
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

type DocsTab = 'api' | 'manual';

// ─── API Docs navigation ────────────────────────────────────────────────────

const apiNavigation: DocsNavSection[] = [
  {
    label: 'Getting Started',
    items: [
      { label: 'Introduction', href: '/docs/getting-started/introduction' },
      { label: 'Quickstart', href: '/docs/getting-started/quickstart' },
      { label: 'Authentication', href: '/docs/getting-started/authentication' },
      { label: 'API Keys', href: '/docs/getting-started/api-keys' },
      { label: 'Manage Fleet', href: '/docs/getting-started/manage-fleet' },
      { label: 'Plan a Route', href: '/docs/getting-started/plan-a-route' },
      { label: 'Your First Route', href: '/docs/getting-started/first-route' },
    ],
  },
  {
    label: 'Guides',
    items: [
      {
        label: 'Route Planning',
        href: '/docs/api-guides/route-planning',
        children: [
          { label: 'Creating Routes', href: '/docs/api-guides/route-planning/creating-routes' },
          { label: 'Understanding HOS', href: '/docs/api-guides/route-planning/understanding-hos' },
          { label: 'Stop Optimization', href: '/docs/api-guides/route-planning/stop-optimization' },
          { label: 'Fuel Stops', href: '/docs/api-guides/route-planning/fuel-stops' },
          { label: 'Rest Stops', href: '/docs/api-guides/route-planning/rest-stops' },
          { label: 'Route Updates', href: '/docs/api-guides/route-planning/route-updates' },
        ],
      },
      {
        label: 'Fleet Management',
        href: '/docs/api-guides/fleet-management',
        children: [
          { label: 'Drivers', href: '/docs/api-guides/fleet-management/drivers' },
          { label: 'Vehicles', href: '/docs/api-guides/fleet-management/vehicles' },
          { label: 'Loads', href: '/docs/api-guides/fleet-management/loads' },
        ],
      },
      {
        label: 'Alerts & Monitoring',
        href: '/docs/api-guides/alerts-monitoring',
        children: [
          { label: 'Alert Types', href: '/docs/api-guides/alerts-monitoring/alert-types' },
          { label: 'Alert Management', href: '/docs/api-guides/alerts-monitoring/alert-management' },
          { label: 'Real-Time Events', href: '/docs/api-guides/alerts-monitoring/real-time-events' },
        ],
      },
      {
        label: 'Integrations',
        href: '/docs/api-guides/integrations',
        children: [
          { label: 'TMS', href: '/docs/api-guides/integrations/tms' },
          { label: 'Samsara ELD', href: '/docs/api-guides/integrations/eld-samsara' },
          { label: 'Webhooks', href: '/docs/api-guides/integrations/webhooks' },
          { label: 'Error Handling', href: '/docs/api-guides/integrations/error-handling' },
        ],
      },
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
      {
        label: 'Multi-Tenancy',
        href: '/docs/api-guides/multi-tenancy',
        children: [
          { label: 'Tenant Setup', href: '/docs/api-guides/multi-tenancy/tenant-setup' },
          { label: 'User Roles', href: '/docs/api-guides/multi-tenancy/user-roles' },
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
    items: [
      { label: 'FAQ', href: '/docs/resources/faq' },
      { label: 'Glossary', href: '/docs/resources/glossary' },
      { label: 'Support', href: '/docs/resources/support' },
      { label: 'Changelog', href: '/docs/resources/changelog' },
    ],
  },
];

// ─── Product Manual navigation ──────────────────────────────────────────────

const manualNavigation: DocsNavSection[] = [
  {
    label: 'Getting Started',
    items: [
      { label: 'Welcome', href: '/docs/manual/getting-started/welcome' },
      { label: 'First Login', href: '/docs/manual/getting-started/first-login' },
      { label: 'Your Plan', href: '/docs/manual/getting-started/understanding-your-plan' },
      { label: 'Key Concepts', href: '/docs/manual/getting-started/key-concepts' },
    ],
  },
  {
    label: 'Dispatcher',
    items: [
      { label: 'Dashboard', href: '/docs/manual/web-app/dispatcher/dashboard-overview' },
      { label: 'Loads', href: '/docs/manual/web-app/dispatcher/managing-loads' },
      { label: 'Drivers', href: '/docs/manual/web-app/dispatcher/managing-drivers' },
      { label: 'Vehicles', href: '/docs/manual/web-app/dispatcher/managing-vehicles' },
      { label: 'Customers', href: '/docs/manual/web-app/dispatcher/managing-customers' },
      { label: 'Route Planning', href: '/docs/manual/web-app/dispatcher/route-planning' },
      { label: 'Alerts', href: '/docs/manual/web-app/dispatcher/alerts-monitoring' },
      { label: 'Tower', href: '/docs/manual/web-app/dispatcher/command-center' },
      { label: 'Shield', href: '/docs/manual/web-app/dispatcher/shield-compliance' },
      { label: 'Billing', href: '/docs/manual/web-app/dispatcher/billing-invoicing' },
      { label: 'Driver Pay', href: '/docs/manual/web-app/dispatcher/driver-pay-settlements' },
      { label: 'Close-Out', href: '/docs/manual/web-app/dispatcher/close-out' },
      { label: 'Documents', href: '/docs/manual/web-app/dispatcher/documents' },
    ],
  },
  {
    label: 'Driver',
    items: [
      { label: 'Home', href: '/docs/manual/web-app/driver/driver-home' },
      { label: 'Route', href: '/docs/manual/web-app/driver/viewing-route' },
      { label: 'Sally AI', href: '/docs/manual/web-app/driver/sally-ai-assistant' },
      { label: 'Alerts', href: '/docs/manual/web-app/driver/alerts-messages' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { label: 'Settings', href: '/docs/manual/web-app/admin/tenant-settings' },
      { label: 'Users', href: '/docs/manual/web-app/admin/user-management' },
      { label: 'Feature Flags', href: '/docs/manual/web-app/admin/feature-flags' },
    ],
  },
  {
    label: 'Customer',
    items: [{ label: 'Customer Portal', href: '/docs/manual/web-app/customer/customer-portal' }],
  },
  {
    label: 'Console',
    items: [
      { label: 'Overview', href: '/docs/manual/console-app/overview' },
      {
        label: 'Configuration',
        href: '/docs/manual/console-app/configuration/operations-settings',
        children: [
          { label: 'Operations', href: '/docs/manual/console-app/configuration/operations-settings' },
          { label: 'Alerts', href: '/docs/manual/console-app/configuration/alert-settings' },
          { label: 'Invoicing', href: '/docs/manual/console-app/configuration/invoicing-settings' },
        ],
      },
      {
        label: 'Integrations',
        href: '/docs/manual/console-app/integrations/samsara-setup',
        children: [
          { label: 'Samsara', href: '/docs/manual/console-app/integrations/samsara-setup' },
          { label: 'QuickBooks', href: '/docs/manual/console-app/integrations/quickbooks-setup' },
          { label: 'Sync', href: '/docs/manual/console-app/integrations/sync-management' },
        ],
      },
      {
        label: 'Developer',
        href: '/docs/manual/console-app/developer/api-keys',
        children: [
          { label: 'API Keys', href: '/docs/manual/console-app/developer/api-keys' },
          { label: 'Webhooks', href: '/docs/manual/console-app/developer/webhooks' },
          { label: 'OAuth', href: '/docs/manual/console-app/developer/oauth-clients' },
          { label: 'AI Assistants', href: '/docs/manual/console-app/developer/ai-assistants' },
        ],
      },
      {
        label: 'Team & Account',
        href: '/docs/manual/console-app/team-account/team-members',
        children: [
          { label: 'Team', href: '/docs/manual/console-app/team-account/team-members' },
          { label: 'Plan & Billing', href: '/docs/manual/console-app/team-account/plan-billing' },
          { label: 'Organization', href: '/docs/manual/console-app/team-account/organization' },
        ],
      },
    ],
  },
  {
    label: 'Sally AI',
    items: [
      { label: 'What is Sally?', href: '/docs/manual/assistant/what-is-sally' },
      { label: 'Asking Questions', href: '/docs/manual/assistant/asking-questions' },
      { label: 'Actions', href: '/docs/manual/assistant/sally-actions' },
      { label: 'Voice Mode', href: '/docs/manual/assistant/voice-mode' },
      { label: 'Doc Intelligence', href: '/docs/manual/assistant/document-intelligence' },
    ],
  },
  {
    label: 'Reference',
    items: [
      { label: 'Roles', href: '/docs/manual/reference/roles-permissions' },
      { label: 'Shortcuts', href: '/docs/manual/reference/keyboard-shortcuts' },
      { label: 'Troubleshooting', href: '/docs/manual/reference/troubleshooting' },
      { label: 'Glossary', href: '/docs/manual/reference/glossary' },
    ],
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

function detectTab(pathname: string): DocsTab {
  return pathname.startsWith('/docs/manual') ? 'manual' : 'api';
}

const COLLAPSED_KEY = 'docs-sidebar-collapsed';

const sectionAbbreviations: Record<string, string> = {
  'Getting Started': 'GS',
  Guides: 'GD',
  'API Reference': 'API',
  Webhooks: 'WH',
  Resources: 'RS',
  Dispatcher: 'DI',
  Driver: 'DR',
  Admin: 'AD',
  Customer: 'CU',
  Console: 'CO',
  'Sally AI': 'AI',
  Reference: 'RF',
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

// ─── Tab Switcher ───────────────────────────────────────────────────────────

function TabSwitcher({ activeTab, onTabChange }: { activeTab: DocsTab; onTabChange: (tab: DocsTab) => void }) {
  return (
    <div className="flex items-center gap-1 p-1 mx-4 mt-3 mb-1 rounded-lg bg-muted/50 border border-border">
      <button
        onClick={() => onTabChange('api')}
        className={cn(
          'flex items-center gap-1.5 flex-1 justify-center py-1.5 px-2 rounded-md text-xs font-medium transition-all',
          activeTab === 'api'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Code2 className="h-3.5 w-3.5" />
        API Docs
      </button>
      <button
        onClick={() => onTabChange('manual')}
        className={cn(
          'flex items-center gap-1.5 flex-1 justify-center py-1.5 px-2 rounded-md text-xs font-medium transition-all',
          activeTab === 'manual'
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <BookMarked className="h-3.5 w-3.5" />
        Manual
      </button>
    </div>
  );
}

// ─── DocsSidebar ────────────────────────────────────────────────────────────

export function DocsSidebar() {
  const pathname = usePathname() ?? '';
  const [activeTab, setActiveTab] = useState<DocsTab>(() => detectTab(pathname));
  const activeNavigation = activeTab === 'manual' ? manualNavigation : apiNavigation;
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => getExpandedKeys(activeNavigation, pathname));
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-switch tab only when navigating to a URL that belongs to the other tab
  const pathnameTabRef = useRef<DocsTab>(detectTab(pathname));
  useEffect(() => {
    const urlTab = detectTab(pathname);
    if (urlTab !== pathnameTabRef.current) {
      pathnameTabRef.current = urlTab;
      setActiveTab(urlTab);
      setSearchQuery('');
    }
  }, [pathname]);

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

  const handleTabChange = (tab: DocsTab) => {
    setActiveTab(tab);
    setSearchQuery('');
    const nav = tab === 'manual' ? manualNavigation : apiNavigation;
    setExpandedKeys(getExpandedKeys(nav, pathname));
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Tab Switcher */}
      <TabSwitcher activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Search */}
      <div className="px-4 pt-2 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === 'manual' ? 'Search manual...' : 'Search API docs...'}
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

        {/* Expanded: tab switcher + nav */}
        {!isCollapsed && sidebarContent}

        {/* Collapsed: tab icons + section initials */}
        {isCollapsed && (
          <div className="flex-1 py-4 px-2 space-y-2 overflow-y-auto">
            {/* Collapsed tab switcher */}
            <div className="flex flex-col gap-1 mb-3 pb-3 border-b border-border">
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleTabChange('api')}
                    className={cn(
                      'flex items-center justify-center h-9 w-full rounded-md transition-colors',
                      activeTab === 'api'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <Code2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  API Docs
                </TooltipContent>
              </Tooltip>
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => handleTabChange('manual')}
                    className={cn(
                      'flex items-center justify-center h-9 w-full rounded-md transition-colors',
                      activeTab === 'manual'
                        ? 'bg-black text-white dark:bg-white dark:text-black'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <BookMarked className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  Product Manual
                </TooltipContent>
              </Tooltip>
            </div>

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
