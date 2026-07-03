import {
  Bell,
  BookOpen,
  Bot,
  Building2,
  CreditCard,
  Headset,
  Home,
  Key,
  Link2,
  LucideIcon,
  Receipt,
  Settings,
  Settings2,
  Sparkles,
  User,
  Users,
  Webhook,
  Send,
  DollarSign,
} from 'lucide-react';

export const CONSOLE_URL = process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3002';

/**
 * Generic platform roles. Tenant members map to MEMBER.
 */
export type UserRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'SUPER_ADMIN';

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
 * Settings sub-panel — Personal, Account, Developer, Activity.
 * Account/Developer/Activity sections are restricted to ADMIN/OWNER.
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
      { label: 'Organization', href: '/settings/organization', icon: Building2 },
      { label: 'Members', href: '/settings/members', icon: Users },
      { label: 'Invitations', href: '/settings/invitations', icon: Send },
      { label: 'Subscription', href: '/settings/subscription', icon: CreditCard },
      { label: 'Billing', href: '/settings/billing', icon: Receipt },
    ],
    roles: ['ADMIN', 'OWNER'],
  },
  {
    label: 'Developer',
    items: [
      { label: 'API Keys', href: '/settings/api-keys', icon: Key, entitlement: 'api_keys' },
      { label: 'Webhooks', href: '/settings/webhooks', icon: Webhook, entitlement: 'webhooks' },
      { label: 'OAuth Clients', href: '/settings/oauth-clients', icon: Link2, entitlement: 'oauth_clients' },
      { label: 'AI Assistants', href: '/settings/ai-integrations', icon: Bot },
      { label: 'API Docs', href: `${CONSOLE_URL}/docs`, icon: BookOpen, external: true },
    ],
    roles: ['ADMIN', 'OWNER'],
  },
];

/**
 * Workspace drawer — shown in the sidebar's bottom row above the profile,
 * for OWNER and ADMIN only.
 */
export const workspaceDrawerSections: SubPanelSection[] = [
  {
    label: '',
    items: [
      { label: 'Organization', href: '/settings/organization', icon: Building2 },
      { label: 'Billing', href: '/settings/billing', icon: Receipt },
      { label: 'Developer Tools', href: '/settings/api-keys', icon: Key },
    ],
  },
  {
    label: '',
    items: [{ label: 'All Settings', href: '/settings/general', icon: Settings }],
  },
];

/**
 * Super Admin settings sub-panel — Personal only.
 */
export const superAdminSettingsSubPanel: SubPanelSection[] = [
  {
    label: 'Personal',
    items: [
      { label: 'Profile', href: '/settings/profile', icon: User },
      { label: 'Preferences', href: '/settings/general', icon: Settings2 },
    ],
  },
];

/**
 * Get sub-panel sections filtered by role
 */
export function getSubPanelSections(_panelId: SubPanelId, role: UserRole | undefined): SubPanelSection[] {
  if (!role) return [];

  const sections = role === 'SUPER_ADMIN' ? superAdminSettingsSubPanel : settingsSubPanel;

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
  return null;
}

/**
 * Centralized navigation configuration.
 *
 * Generic platform sidebar:
 * - Home          (/)
 * - AI Assistant  (/ai)
 * - Settings      (/settings, opens the settings sub-panel)
 * - Admin         (/admin, SUPER_ADMIN only)
 */
const memberNav: NavigationItem[] = [
  { label: 'Home', href: '/', icon: Home, exact: true },
  { label: 'AI Assistant', href: '/ai', icon: Sparkles, highlight: true },
  { label: 'Settings', href: '/settings/general', icon: Settings, subPanel: 'settings' },
];

export const navigationConfig: Record<string, NavigationItem[]> = {
  member: memberNav,
  admin: memberNav,
  owner: memberNav,

  // Super-admin surfaces that ship with the starter: tenant lifecycle
  // management and AI spend. The backend exposes more admin modules
  // (feature flags, broadcasts, background jobs, events, login activity,
  // plans, billing, cache) — add pages under apps/web/src/app/admin/ and
  // list them here as you build their UIs.
  super_admin: [
    { label: 'Tenants', href: '/admin/tenants', icon: Building2 },
    { label: 'AI Spend', href: '/admin/ai-spend', icon: DollarSign },
    { label: 'Settings', href: '/settings/profile', icon: Settings, subPanel: 'settings' },
  ],
};

/**
 * Public routes that don't require authentication
 */
export const publicRoutes = ['/', '/login'] as const;

/**
 * Routes that require authentication.
 * Keep in sync with PROTECTED_PREFIXES in src/middleware.ts — the two lists
 * must match exactly.
 */
export const protectedRoutePatterns = ['/admin', '/ai', '/onboarding', '/settings'] as const;

/**
 * Get navigation items based on user role
 */
export function getNavigationForRole(role: UserRole | undefined): NavigationItem[] {
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
  return publicRoutes.includes(pathname as any) || pathname.startsWith('/login');
}

/**
 * Get default route for user role — the post-login landing surface.
 *
 * Note: '/' is the public marketing/landing page, so authenticated tenant
 * users land on the AI assistant instead. Keep ROLE_DEFAULT_ROUTES in
 * src/middleware.ts aligned with this function.
 */
export function getDefaultRouteForRole(role: UserRole | undefined): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/admin/tenants';
    case 'OWNER':
    case 'ADMIN':
    case 'MEMBER':
      return '/ai';
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
 * Used by the login flow to redirect back to other platform apps (e.g. docs).
 * Returns null if the URL is missing, invalid, or points to an untrusted domain.
 */
export function getReturnToUrl(returnTo: string | null | undefined): string | null {
  if (!returnTo) return null;
  try {
    const url = new URL(returnTo);
    const appDomain = process.env.NEXT_PUBLIC_APP_DOMAIN;
    const allowed = url.hostname === 'localhost' || (!!appDomain && url.hostname.endsWith(appDomain));
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
  return { url: getDefaultRouteForRole(role as UserRole), isExternal: false };
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
