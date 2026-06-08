import {
  Activity,
  AlertTriangle,
  ArrowLeftRight,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  Building2,
  Calendar,
  ChevronRight,
  ClipboardList,
  Cloud,
  CreditCard,
  DollarSign,
  Eye,
  Flag,
  Fuel,
  Headset,
  History,
  Home,
  Key,
  Link2,
  LucideIcon,
  Map,
  MessageSquare,
  MessageSquarePlus,
  Network,
  Package,
  PackageCheck,
  Plug,
  Puzzle,
  Radio,
  Receipt,
  RefreshCw,
  Rocket,
  Route,
  Search,
  Settings,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  User,
  Users,
  Wallet,
  Webhook,
  FileText,
  Send,
  Zap,
} from 'lucide-react';

export const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3002';

export type UserRole = 'DISPATCHER' | 'DRIVER' | 'ADMIN' | 'OWNER' | 'CUSTOMER' | 'SUPER_ADMIN';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  roles?: UserRole[];
  entitlement?: string; // Plan entitlement key — if set, hidden when not entitled
  entitlements?: string[]; // OR logic — hidden if NONE of the entitlements pass hasFeature()
  highlight?: boolean; // Show sparkle icon to draw attention
  subPanel?: 'settings'; // Opens a sub-panel instead of navigating
  exact?: boolean; // Only match when pathname === href (no prefix matching)
}

export interface NavSeparator {
  type: 'separator';
  label: string;
  roles?: UserRole[];
}

export type NavigationItem = NavItem | NavSeparator;

/**
 * Sub-panel navigation — replaces sidebar content when Settings > is clicked.
 * Back button returns to main sidebar.
 */
export interface SubPanelSection {
  label: string;
  items: SubPanelNavItem[];
  roles?: UserRole[];
}

export interface SubPanelNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  entitlement?: string;
  entitlements?: string[];
  external?: boolean; // Opens in new context (e.g., API Docs)
}

export type SubPanelId = 'settings';

/**
 * Settings sub-panel — Personal, Account, Configuration, Integrations, Developer, Activity
 * Sections are role-gated: DISPATCHER sees only Personal + Activity,
 * ADMIN/OWNER sees everything.
 */
export const settingsSubPanel: SubPanelSection[] = [
  {
    label: 'Personal',
    items: [
      { label: 'Profile', href: '/settings/profile', icon: Settings },
      { label: 'Preferences', href: '/settings/general', icon: Settings2 },
      { label: 'Notifications', href: '/settings/notifications', icon: Bell },
      { label: 'Support', href: '/settings/support', icon: Headset },
    ],
  },
  {
    label: 'Account',
    items: [
      {
        label: 'Organization',
        href: '/settings/organization',
        icon: Building2,
      },
      { label: 'Members', href: '/settings/members', icon: Users },
      { label: 'Invitations', href: '/settings/invitations', icon: Send },
      {
        label: 'Subscription',
        href: '/settings/subscription',
        icon: CreditCard,
      },
      { label: 'Billing', href: '/settings/billing', icon: Receipt },
      { label: 'Usage & Invoices', href: '/settings/usage', icon: BarChart3 },
      {
        label: 'Login Activity',
        href: '/settings/security',
        icon: History,
        entitlement: 'login_activity',
      },
    ],
    roles: ['ADMIN', 'OWNER'],
  },
  {
    label: 'Configuration',
    items: [
      {
        label: 'Dispatch Defaults',
        href: '/settings/operations',
        icon: Settings2,
      },
      { label: 'Alert Rules', href: '/settings/alerts', icon: Bell },
      { label: 'Invoicing', href: '/settings/invoice', icon: FileText },
      {
        label: 'Custom Fields',
        href: '/settings/custom-fields',
        icon: SlidersHorizontal,
      },
      {
        label: 'EDI',
        href: '/settings/edi',
        icon: ArrowLeftRight,
        entitlement: 'edi_integration',
      },
    ],
    roles: ['ADMIN', 'OWNER'],
  },
  {
    label: 'Integrations',
    items: [
      {
        label: 'Connections',
        href: '/settings/integrations',
        icon: Plug,
        entitlement: 'samsara_integration',
      },
      {
        label: 'Sync Status',
        href: '/settings/sync',
        icon: RefreshCw,
        entitlement: 'samsara_integration',
      },
    ],
    roles: ['ADMIN', 'OWNER'],
  },
  {
    label: 'Developer',
    items: [
      {
        label: 'API Keys',
        href: '/settings/api-keys',
        icon: Key,
        entitlement: 'api_keys',
      },
      {
        label: 'Webhooks',
        href: '/settings/webhooks',
        icon: Webhook,
        entitlement: 'webhooks',
      },
      {
        label: 'OAuth Clients',
        href: '/settings/oauth-clients',
        icon: Link2,
        entitlement: 'oauth_clients',
      },
      { label: 'AI Assistants', href: '/settings/ai-integrations', icon: Bot },
      {
        label: 'API Docs',
        href: `${CONSOLE_URL}/docs`,
        icon: BookOpen,
        external: true,
      },
    ],
    roles: ['ADMIN', 'OWNER'],
  },
  {
    label: 'Activity',
    items: [
      {
        label: 'System Activity',
        href: '/settings/system-activity',
        icon: Activity,
      },
    ],
    roles: ['ADMIN', 'OWNER', 'DISPATCHER'],
  },
];

/**
 * Workspace drawer — shown in the sidebar's bottom row above the profile,
 * for OWNER and ADMIN only. Contains business-level surfaces (setup, add-ons,
 * account, team) and the Settings entry. Reuses SubPanelSection so the
 * Settings item can still trigger the existing settings sub-panel flow.
 */
export const workspaceDrawerSections: SubPanelSection[] = [
  {
    label: '',
    items: [
      { label: 'Setup Hub', href: '/setup-hub', icon: Rocket },
      { label: 'Add-ons', href: '/dispatcher/add-ons', icon: Puzzle },
    ],
  },
  {
    label: '',
    items: [
      {
        label: 'Organization',
        href: '/settings/organization',
        icon: Building2,
      },
      { label: 'Billing', href: '/settings/billing', icon: Receipt },
      {
        label: 'Configuration',
        href: '/settings/operations',
        icon: SlidersHorizontal,
      },
      { label: 'Integrations', href: '/settings/integrations', icon: Plug },
      { label: 'Activity', href: '/settings/system-activity', icon: Activity },
      { label: 'Developer Tools', href: '/settings/api-keys', icon: Key },
    ],
  },
  {
    label: '',
    items: [{ label: 'All Settings', href: '/settings/general', icon: Settings }],
  },
];

/**
 * Super Admin settings sub-panel — Personal + Platform
 */
export const superAdminSettingsSubPanel: SubPanelSection[] = [
  {
    label: 'Personal',
    items: [
      { label: 'Profile', href: '/admin/settings/profile', icon: User },
      {
        label: 'Preferences',
        href: '/admin/settings/preferences',
        icon: Settings2,
      },
    ],
  },
];

/**
 * Driver-specific settings — no sub-panel, uses simplified settings layout
 */
export const driverSettingsSubPanel: SubPanelSection[] = [
  {
    label: 'Personal',
    items: [
      { label: 'Profile', href: '/settings/profile', icon: Settings },
      { label: 'Preferences', href: '/settings/general', icon: Settings2 },
      { label: 'Notifications', href: '/settings/notifications', icon: Bell },
      { label: 'Route Display', href: '/settings/driver', icon: Map },
      { label: 'Support', href: '/settings/support', icon: Headset },
    ],
  },
];

/**
 * Get sub-panel sections filtered by role
 */
export function getSubPanelSections(_panelId: SubPanelId, role: UserRole | undefined): SubPanelSection[] {
  if (!role) return [];

  const sections =
    role === 'DRIVER' ? driverSettingsSubPanel : role === 'SUPER_ADMIN' ? superAdminSettingsSubPanel : settingsSubPanel;

  return sections.filter((section) => {
    if (!section.roles) return true;
    return section.roles.includes(role);
  });
}

/**
 * Determine which sub-panel should be active based on the current pathname
 */
export function getActiveSubPanel(pathname: string): SubPanelId | null {
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/admin/settings')) return 'settings';
  return null;
}

/**
 * Centralized navigation configuration for SALLY
 *
 * Design philosophy:
 * - Sidebar = places you GO (workspaces, tools)
 * - Header icons = things that COME TO YOU (alerts, notifications)
 * - Every item must earn its spot through daily-use frequency
 * - Alerts & notifications are header-level concerns (icon → popover → full page)
 */
export const navigationConfig: Record<string, NavigationItem[]> = {
  dispatcher: [
    // HIDDEN FOR NOW — Sally's Desk is the default landing while Home is paused.
    // { label: 'Home', href: '/dispatcher', icon: Home, exact: true },
    {
      label: "Sally's Desk",
      href: '/dispatcher/desk',
      icon: Bot,
      entitlement: 'sallys_desk',
    },
    { type: 'separator', label: 'Plan' } as NavSeparator,
    {
      label: 'Inbox',
      href: '/dispatcher/inbox',
      icon: Search,
      entitlements: ['load_board', 'edi_integration'],
    },
    { label: 'Loads', href: '/dispatcher/loads', icon: ClipboardList },
    {
      label: 'Horizon',
      href: '/dispatcher/horizon',
      icon: Calendar,
      entitlement: 'horizon',
    },
    {
      label: 'Smart Routes',
      href: '/dispatcher/smart-routes',
      icon: Route,
      entitlement: 'route_planning',
    },
    { type: 'separator', label: 'Monitor' } as NavSeparator,
    {
      label: 'Tower',
      href: '/dispatcher/tower',
      icon: Eye,
      entitlement: 'command_center',
    },
    {
      label: 'Alerts',
      href: '/dispatcher/alerts',
      icon: AlertTriangle,
      entitlement: 'alerts',
    },
    {
      label: 'Shield',
      href: '/dispatcher/shield',
      icon: ShieldCheck,
      entitlement: 'shield',
    },
    {
      label: 'Insights',
      href: '/dispatcher/insights',
      icon: BarChart3,
      entitlement: 'insights',
    },
    { type: 'separator', label: 'Money' } as NavSeparator,
    { label: 'Close Out', href: '/dispatcher/close-out', icon: PackageCheck },
    { label: 'Billing', href: '/dispatcher/billing', icon: Receipt },
    { label: 'Pay', href: '/dispatcher/pay', icon: Wallet },
    {
      label: 'IFTA',
      href: '/dispatcher/ifta',
      icon: Fuel,
      entitlement: 'ifta',
    },
    { type: 'separator', label: 'Operate' } as NavSeparator,
    { label: 'Fleet', href: '/dispatcher/fleet', icon: Package },
    { label: 'Network', href: '/dispatcher/network', icon: Network },
    {
      label: 'Settings',
      href: '/settings/general',
      icon: Settings,
      subPanel: 'settings',
    },
  ],

  driver: [
    { label: 'Trip', href: '/driver/trip', icon: Map },
    { label: 'Comms', href: '/driver/comms', icon: Radio },
    { label: 'Me', href: '/driver/me', icon: User },
  ],

  admin: [
    // HIDDEN FOR NOW — Sally's Desk is the default landing while Home is paused.
    // { label: 'Home', href: '/dispatcher', icon: Home, exact: true },
    {
      label: "Sally's Desk",
      href: '/dispatcher/desk',
      icon: Bot,
      entitlement: 'sallys_desk',
    },
    { type: 'separator', label: 'Plan' } as NavSeparator,
    {
      label: 'Inbox',
      href: '/dispatcher/inbox',
      icon: Search,
      entitlements: ['load_board', 'edi_integration'],
    },
    { label: 'Loads', href: '/dispatcher/loads', icon: ClipboardList },
    {
      label: 'Horizon',
      href: '/dispatcher/horizon',
      icon: Calendar,
      entitlement: 'horizon',
    },
    {
      label: 'Smart Routes',
      href: '/dispatcher/smart-routes',
      icon: Route,
      entitlement: 'route_planning',
    },
    { type: 'separator', label: 'Monitor' } as NavSeparator,
    {
      label: 'Tower',
      href: '/dispatcher/tower',
      icon: Eye,
      entitlement: 'command_center',
    },
    {
      label: 'Alerts',
      href: '/dispatcher/alerts',
      icon: AlertTriangle,
      entitlement: 'alerts',
    },
    {
      label: 'Shield',
      href: '/dispatcher/shield',
      icon: ShieldCheck,
      entitlement: 'shield',
    },
    {
      label: 'Insights',
      href: '/dispatcher/insights',
      icon: BarChart3,
      entitlement: 'insights',
    },
    { type: 'separator', label: 'Money' } as NavSeparator,
    { label: 'Close Out', href: '/dispatcher/close-out', icon: PackageCheck },
    { label: 'Billing', href: '/dispatcher/billing', icon: Receipt },
    { label: 'Pay', href: '/dispatcher/pay', icon: Wallet },
    {
      label: 'IFTA',
      href: '/dispatcher/ifta',
      icon: Fuel,
      entitlement: 'ifta',
    },
    { type: 'separator', label: 'Operate' } as NavSeparator,
    { label: 'Fleet', href: '/dispatcher/fleet', icon: Package },
    { label: 'Network', href: '/dispatcher/network', icon: Network },
  ],

  owner: [
    // HIDDEN FOR NOW — Sally's Desk is the default landing while Home is paused.
    // { label: 'Home', href: '/dispatcher', icon: Home, exact: true },
    {
      label: "Sally's Desk",
      href: '/dispatcher/desk',
      icon: Bot,
      entitlement: 'sallys_desk',
    },
    { type: 'separator', label: 'Plan' } as NavSeparator,
    {
      label: 'Inbox',
      href: '/dispatcher/inbox',
      icon: Search,
      entitlements: ['load_board', 'edi_integration'],
    },
    { label: 'Loads', href: '/dispatcher/loads', icon: ClipboardList },
    {
      label: 'Horizon',
      href: '/dispatcher/horizon',
      icon: Calendar,
      entitlement: 'horizon',
    },
    {
      label: 'Smart Routes',
      href: '/dispatcher/smart-routes',
      icon: Route,
      entitlement: 'route_planning',
    },
    { type: 'separator', label: 'Monitor' } as NavSeparator,
    {
      label: 'Tower',
      href: '/dispatcher/tower',
      icon: Eye,
      entitlement: 'command_center',
    },
    {
      label: 'Alerts',
      href: '/dispatcher/alerts',
      icon: AlertTriangle,
      entitlement: 'alerts',
    },
    {
      label: 'Shield',
      href: '/dispatcher/shield',
      icon: ShieldCheck,
      entitlement: 'shield',
    },
    {
      label: 'Insights',
      href: '/dispatcher/insights',
      icon: BarChart3,
      entitlement: 'insights',
    },
    { type: 'separator', label: 'Money' } as NavSeparator,
    { label: 'Close Out', href: '/dispatcher/close-out', icon: PackageCheck },
    { label: 'Billing', href: '/dispatcher/billing', icon: Receipt },
    { label: 'Pay', href: '/dispatcher/pay', icon: Wallet },
    {
      label: 'IFTA',
      href: '/dispatcher/ifta',
      icon: Fuel,
      entitlement: 'ifta',
    },
    { type: 'separator', label: 'Operate' } as NavSeparator,
    { label: 'Fleet', href: '/dispatcher/fleet', icon: Package },
    { label: 'Network', href: '/dispatcher/network', icon: Network },
  ],

  super_admin: [
    { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
    { type: 'separator', label: 'Operations' } as NavSeparator,
    { label: 'Feature Flags', href: '/admin/feature-flags', icon: Flag },
    { label: 'Broadcasts', href: '/admin/broadcasts', icon: Radio },
    {
      label: 'Background Jobs',
      href: '/admin/background-jobs',
      icon: Activity,
    },
    { label: 'Events', href: '/admin/events', icon: Zap },
    { label: 'Login Activity', href: '/admin/login-activity', icon: History },
    { label: 'AI Spend', href: '/admin/ai-spend', icon: DollarSign },
    { type: 'separator', label: 'Revenue' } as NavSeparator,
    { label: 'Plans & Entitlements', href: '/admin/plans', icon: CreditCard },
    { label: 'Billing Pulse', href: '/admin/billing', icon: Receipt },
    { type: 'separator', label: 'System' } as NavSeparator,
    { label: 'Platform Health', href: '/admin/platform-health', icon: Cloud },
    { label: 'Cache Management', href: '/admin/cache', icon: RefreshCw },
    { label: 'Fuel Cards', href: '/admin/fuel-cards', icon: Fuel },
    {
      label: 'Settings',
      href: '/admin/settings/profile',
      icon: Settings,
      subPanel: 'settings',
    },
  ],

  customer: [
    { label: 'My Shipments', href: '/customer/dashboard', icon: Package },
    { type: 'separator', label: 'Control' } as NavSeparator,
    {
      label: 'Settings',
      href: '/settings/general',
      icon: Settings,
      subPanel: 'settings',
    },
  ],
};

/**
 * Public routes that don't require authentication
 */
export const publicRoutes = ['/', '/login', '/track'] as const;

/**
 * Routes that require authentication
 */
export const protectedRoutePatterns = [
  '/dispatcher',
  '/driver',
  '/admin',
  '/customer',
  '/settings',
  '/setup-hub',
  '/notifications',
  '/docs',
] as const;

/**
 * Get navigation items based on user role
 */
export function getNavigationForRole(
  role: 'DISPATCHER' | 'DRIVER' | 'ADMIN' | 'OWNER' | 'CUSTOMER' | 'SUPER_ADMIN' | undefined,
): NavigationItem[] {
  if (!role) return [];

  const roleKey = role.toLowerCase() as keyof typeof navigationConfig;
  return navigationConfig[roleKey] || [];
}

/**
 * Check if a route requires authentication
 */
export function isProtectedRoute(pathname: string): boolean {
  return protectedRoutePatterns.some((pattern) => pathname.startsWith(pattern));
}

/**
 * Check if a route is public (doesn't require auth)
 */
export function isPublicRoute(pathname: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return publicRoutes.includes(pathname as any) || pathname.startsWith('/login') || pathname.startsWith('/track');
}

/**
 * Get default route for user role
 */
export function getDefaultRouteForRole(
  role: 'DISPATCHER' | 'DRIVER' | 'ADMIN' | 'OWNER' | 'CUSTOMER' | 'SUPER_ADMIN' | undefined,
): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/admin/tenants';
    // Fleet roles resolve their landing surface at `/dispatcher`, which redirects
    // to Sally's Desk (if entitled) or Loads. Keeping the decision in one place
    // (DispatcherDefaultRedirect) avoids duplicating the entitlement check across
    // every post-login flow. While Home is paused (#747), `/dispatcher` never
    // renders Home itself.
    case 'OWNER':
      return '/dispatcher';
    case 'ADMIN':
      return '/dispatcher';
    case 'DISPATCHER':
      return '/dispatcher';
    case 'DRIVER':
      return '/driver/trip';
    case 'CUSTOMER':
      return '/customer/dashboard';
    default:
      return '/login';
  }
}

/**
 * Check if a string is a safe internal path (same-origin, no open-redirect).
 */
export function isSafeInternalPath(path: string | null | undefined): path is string {
  return !!path && path.startsWith('/') && !path.startsWith('//');
}

/**
 * Validate and return a returnTo URL if it points to an allowed domain.
 * Used by the login flow to redirect back to the docs portal or other SALLY apps.
 * Returns null if the URL is missing, invalid, or points to an untrusted domain.
 */
export function getReturnToUrl(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  try {
    const url = new URL(returnTo);
    const allowed =
      url.hostname === 'localhost' ||
      url.hostname.endsWith('.appshore.in') ||
      url.hostname.endsWith('.sally.appshore.in');
    return allowed ? returnTo : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the post-login redirect destination.
 *
 * Priority:
 *  1. ?redirect= (middleware-supplied, internal path only)
 *  2. ?returnTo= starting with / (internal path, e.g. /oauth/consent)
 *  3. ?returnTo= absolute URL on an allowed domain (external, e.g. docs portal)
 *  4. Role-based default route
 *
 * Returns { url, isExternal } so the caller knows whether to use router.push
 * or window.location.href (with token relay for external).
 */
export function resolvePostLoginRedirect(params: { redirect: string | null; returnTo: string | null; role: string }): {
  url: string;
  isExternal: boolean;
} {
  const { redirect, returnTo, role } = params;

  // 1. Middleware-supplied ?redirect= (always an internal path)
  if (isSafeInternalPath(redirect)) {
    return { url: redirect, isExternal: false };
  }

  // 2. Internal returnTo path (e.g. /oauth/consent?challenge=...)
  if (isSafeInternalPath(returnTo)) {
    return { url: returnTo, isExternal: false };
  }

  // 3. External returnTo URL on an allowed domain
  const externalUrl = getReturnToUrl(returnTo);
  if (externalUrl) {
    return { url: externalUrl, isExternal: true };
  }

  // 4. Default role-based route
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { url: getDefaultRouteForRole(role as any), isExternal: false };
}

/**
 * Check whether the access token is still valid (not expired).
 * Returns the token if valid, or null if expired/missing.
 */
export function getValidToken(currentToken: string | null): string | null {
  if (!currentToken) return null;

  // Decode JWT to check expiry (base64url — no verification needed client-side)
  try {
    const payload = JSON.parse(atob(currentToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expiresAt = payload.exp * 1000;
    // Token must have at least 30 seconds remaining
    if (expiresAt - Date.now() > 30_000) return currentToken;
  } catch {
    // Can't decode — return it and let the backend validate
    return currentToken;
  }

  return null; // Expired
}
