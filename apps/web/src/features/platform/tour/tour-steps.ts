import type { TourStepConfig } from './types';

export const TOUR_ID = 'platform-tour';

const ALL_ROLES = ['MEMBER', 'ADMIN', 'OWNER'];
const ADMIN_ROLES = ['ADMIN', 'OWNER'];

/**
 * A short, generic product tour for the starter. Each step points at a real
 * platform surface that ships out of the box. Add steps as you build your own
 * features — set `route` to the page, `selector` to the element to highlight,
 * and gate with `roles`. Steps are filtered by role; prev/next routes are
 * recalculated after filtering.
 */
export const tourSteps: TourStepConfig[] = [
  {
    icon: null,
    title: 'AI Assistant',
    content:
      'Ask the assistant anything. It streams answers, can call tools you register via MCP, and is grounded in your knowledge base. This is the heart of the platform.',
    selector: '#tour-nav-assistant',
    side: 'right',
    route: '/settings/ai-integrations',
    roles: ALL_ROLES,
  },
  {
    icon: null,
    title: 'Members',
    content:
      'Invite your team and assign roles. Membership is the ground truth for access control across everything else.',
    selector: '#tour-nav-members',
    side: 'right',
    route: '/settings/members',
    roles: ADMIN_ROLES,
  },
  {
    icon: null,
    title: 'Billing & Plans',
    content: 'Manage your subscription, plan, and usage. Entitlements gate which features are available.',
    selector: '#tour-nav-billing',
    side: 'right',
    route: '/settings/billing',
    roles: ADMIN_ROLES,
  },
  {
    icon: null,
    title: 'Settings',
    content:
      'Make it yours — profile, organization, security, notifications, API keys, and integrations all live here.',
    selector: '#tour-nav-settings',
    side: 'right',
    route: '/settings',
    roles: ALL_ROLES,
  },
];

/**
 * Returns the tour steps visible to a given role, filtered by entitlement.
 * A step is shown when the role matches AND (no entitlement gate, or at least
 * one of its entitlements passes `hasFeature`).
 */
export function getStepsForRole(role: string, hasFeature: (key: string) => boolean): TourStepConfig[] {
  return tourSteps.filter((step) => {
    if (!step.roles.includes(role)) return false;
    if (step.entitlement && !hasFeature(step.entitlement)) return false;
    if (step.entitlements && step.entitlements.length > 0) {
      return step.entitlements.some((e) => hasFeature(e));
    }
    return true;
  });
}
