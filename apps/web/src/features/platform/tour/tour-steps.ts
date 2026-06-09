import type { TourStepConfig } from './types';

export const TOUR_ID = 'platform-tour';

const DISPATCHER_ROLES = ['DISPATCHER', 'ADMIN', 'OWNER'];
const ADMIN_ROLES = ['ADMIN', 'OWNER'];
const ALL_TMS_ROLES = ['DISPATCHER', 'ADMIN', 'OWNER', 'DRIVER'];

/**
 * Tour narrative arc — a new user's first visit:
 *
 *   Act I  — Set up:  Workspace → Members
 *   Act II — Operate: Assistant's Desk → Activity → Notifications
 *   Act III — Configure: Billing → Integrations → Insights
 *   Epilogue — Make it yours: Settings
 *
 * Steps are filtered by role AND entitlement/feature-flag visibility.
 * prevRoute/nextRoute are recalculated after filtering.
 */
export const tourSteps: TourStepConfig[] = [
  // ── Act I · Set up your workspace ────────────────────────────
  {
    icon: null,
    title: 'Workspace',
    content:
      'Click your company name to open the launcher — Setup Hub, Add-ons, and quick jumps into every corner of Settings. Start here on day one.',
    selector: '#tour-nav-workspace',
    side: 'right',
    route: '/dispatcher',
    roles: ADMIN_ROLES,
  },
  {
    icon: null,
    title: 'Members',
    content:
      'Your team. Invite people, assign roles, and manage who can access what. This is the ground truth for everything else the Assistant does.',
    selector: '#tour-nav-fleet',
    side: 'right',
    route: '/dispatcher/fleet',
    roles: ALL_TMS_ROLES,
  },

  // ── Act II · Run the business ────────────────────────────────
  {
    icon: null,
    title: "Assistant's Desk",
    content:
      'Your AI agents at work — drafting replies, chasing tasks, flagging things that need attention. You approve, override, or let them run. Think of it as a team of employees that never sleeps.',
    selector: '#tour-nav-assistant-s-desk',
    side: 'right',
    route: '/dispatcher/desk',
    roles: DISPATCHER_ROLES,
    entitlement: 'assistants_desk',
  },
  {
    icon: null,
    title: 'Inbox',
    content:
      'Everything coming your way in one place. Read messages, triage requests, and act on what matters — without switching tools.',
    selector: '#tour-nav-inbox',
    side: 'right',
    route: '/dispatcher/inbox',
    roles: DISPATCHER_ROLES,
    entitlements: ['load_board', 'edi_integration'],
  },
  {
    icon: null,
    title: 'Records',
    content:
      'The heart of your workspace. Create a record, assign an owner, and track it through to completion. Everything connects back here.',
    selector: '#tour-nav-loads',
    side: 'right',
    route: '/dispatcher/loads',
    roles: ALL_TMS_ROLES,
  },
  {
    icon: null,
    title: 'Horizon',
    content:
      'A look ahead. See what is coming up, where capacity is tight, and where problems may surface before they happen.',
    selector: '#tour-nav-horizon',
    side: 'right',
    route: '/dispatcher/horizon',
    roles: DISPATCHER_ROLES,
    entitlement: 'horizon',
  },
  {
    icon: null,
    title: 'Smart Plans',
    content:
      'Plan multi-step work with the Assistant. It suggests the order, the handoffs, and the next move — so things run with fewer surprises.',
    selector: '#tour-nav-smart-routes',
    side: 'right',
    route: '/dispatcher/smart-routes',
    roles: DISPATCHER_ROLES,
    entitlement: 'route_planning',
  },
  {
    icon: null,
    title: 'Tower',
    content:
      'Your workspace, right now. Live status, active work, and anything that needs attention — one screen. This is where your day lives once things are moving.',
    selector: '#tour-nav-tower',
    side: 'right',
    route: '/dispatcher/tower',
    roles: DISPATCHER_ROLES,
    entitlement: 'command_center',
  },
  {
    icon: null,
    title: 'Alerts',
    content:
      'Things go sideways — overdue tasks, approaching deadlines, items that need a follow-up. Alerts catch them before they become expensive.',
    selector: '#tour-nav-alerts',
    side: 'right',
    route: '/dispatcher/alerts',
    roles: ALL_TMS_ROLES,
    entitlement: 'alerts',
  },
  {
    icon: null,
    title: 'Shield',
    content:
      'Your health scorecard. Surfaces issues early, then points you at the fix. Runs in the background so reviews never surprise you.',
    selector: '#tour-nav-shield',
    side: 'right',
    route: '/dispatcher/shield',
    roles: DISPATCHER_ROLES,
    entitlement: 'shield',
  },

  // ── Act III · Get paid and measure ───────────────────────────
  {
    icon: null,
    title: 'Close Out',
    content:
      'Work done? Verify the details — documents, sign-off, approvals. This is your quality gate before the invoice goes out.',
    selector: '#tour-nav-close-out',
    side: 'right',
    route: '/dispatcher/close-out',
    roles: DISPATCHER_ROLES,
  },
  {
    icon: null,
    title: 'Billing',
    content: 'Get paid. Generate invoices, track aging, chase overdue customers, and sync to your accounting tools.',
    selector: '#tour-nav-billing',
    side: 'right',
    route: '/dispatcher/billing',
    roles: DISPATCHER_ROLES,
  },
  {
    icon: null,
    title: 'Pay',
    content:
      'Pay your team. Settlements calculate earnings — hourly, percentage, flat rate, bonuses — and push straight to accounting.',
    selector: '#tour-nav-pay',
    side: 'right',
    route: '/dispatcher/pay',
    roles: DISPATCHER_ROLES,
  },
  {
    icon: null,
    title: 'Tax',
    content:
      'Tax reporting without the spreadsheet. The Assistant tracks the numbers as you operate, so quarterly filings take minutes.',
    selector: '#tour-nav-ifta',
    side: 'right',
    route: '/dispatcher/ifta',
    roles: DISPATCHER_ROLES,
    entitlement: 'ifta',
  },
  {
    icon: null,
    title: 'Insights',
    content:
      'The bigger picture. Revenue trends, team performance, profitability — the numbers that shape smarter decisions next month.',
    selector: '#tour-nav-insights',
    side: 'right',
    route: '/dispatcher/insights',
    roles: DISPATCHER_ROLES,
    entitlement: 'insights',
  },

  // ── Epilogue · Make it yours ─────────────────────────────────
  // Settings is toured for every role. Admins/Owners see Account, Billing,
  // Integrations, Developer, Activity. Others see Personal + Activity.
  {
    icon: null,
    title: 'Settings',
    content:
      'One roof for everything configurable — account, billing, integrations, team, developer tools, activity. Use the search at the top to jump to anything in a keystroke.',
    selector: '#tour-nav-settings',
    side: 'right',
    route: '/settings/general',
    roles: ['DISPATCHER', 'DRIVER', 'CUSTOMER'],
  },
];

/**
 * Filter tour steps by role AND entitlement visibility.
 * Mirrors the exact gating logic the sidebar uses (hasFeature checks
 * feature flags → add-ons → plan entitlements).
 *
 * @param role      - User's role
 * @param hasFeature - The unified feature-check function from usePlan().
 *                     When omitted (e.g. during loading), entitlement gates
 *                     are skipped so the step count stays optimistic.
 */
export function getStepsForRole(role: string, hasFeature?: (key: string) => boolean): TourStepConfig[] {
  const filtered = tourSteps.filter((step) => {
    // 1. Role gate
    if (!step.roles.includes(role)) return false;

    // 2. Entitlement / feature-flag gate (matches sidebar gating logic)
    if (hasFeature) {
      if (step.entitlements?.length) {
        if (!step.entitlements.some((e) => hasFeature(e))) return false;
      } else if (step.entitlement) {
        if (!hasFeature(step.entitlement)) return false;
      }
    }

    return true;
  });

  return filtered.map((step, index) => ({
    ...step,
    prevRoute: index > 0 ? filtered[index - 1].route : undefined,
    nextRoute: index < filtered.length - 1 ? filtered[index + 1].route : undefined,
  }));
}
