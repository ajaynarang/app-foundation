import type { TourStepConfig } from './types';

export const TOUR_ID = 'platform-tour';

const DISPATCHER_ROLES = ['DISPATCHER', 'ADMIN', 'OWNER'];
const ADMIN_ROLES = ['ADMIN', 'OWNER'];
const ALL_TMS_ROLES = ['DISPATCHER', 'ADMIN', 'OWNER', 'DRIVER'];

/**
 * Tour narrative arc — a new operator's first day:
 *
 *   Act I  — Set up:  Workspace → Fleet
 *   Act II — Operate: Assistant's Desk → Inbox → Loads → Horizon → Smart Routes
 *                     → Tower → Alerts → Shield
 *   Act III — Get paid: Close Out → Billing → Pay → IFTA → Insights
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
    title: 'Fleet',
    content:
      'Your people and machines. Add drivers, trucks, and trailers. Connect your ELD. This is the ground truth for everything else Assistant does.',
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
      'Your AI agents at work — drafting dispatch, chasing documents, flagging risk. You approve, override, or let them run. Think of it as a team of employees that never sleeps.',
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
      'Find your next haul. Search DAT, match inbound EDI tenders, read broker emails — one place for every load coming your way.',
    selector: '#tour-nav-inbox',
    side: 'right',
    route: '/dispatcher/inbox',
    roles: DISPATCHER_ROLES,
    entitlements: ['load_board', 'edi_integration'],
  },
  {
    icon: null,
    title: 'Loads',
    content:
      'The heart of your operation. Create a load, assign a driver, track it from pickup to POD. Everything connects back here.',
    selector: '#tour-nav-loads',
    side: 'right',
    route: '/dispatcher/loads',
    roles: ALL_TMS_ROLES,
  },
  {
    icon: null,
    title: 'Horizon',
    content:
      'Capacity a week out. See which drivers are free, which lanes are hot, and where you risk dead miles before they happen.',
    selector: '#tour-nav-horizon',
    side: 'right',
    route: '/dispatcher/horizon',
    roles: DISPATCHER_ROLES,
    entitlement: 'horizon',
  },
  {
    icon: null,
    title: 'Smart Routes',
    content:
      'Plan multi-stop runs with HOS built in. Assistant picks fuel stops, sleeper splits, and detours — so miles roll with fewer surprises.',
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
      'Your fleet, right now. Live positions, active loads, and anything that needs attention — one screen. This is where your day lives once the wheels are rolling.',
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
      'Things go sideways — late arrivals, expiring HOS, maintenance overdue. Alerts catch them before they become expensive.',
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
      'Your compliance scorecard. Surfaces safety and HOS issues early, then points you at the fix. Runs in the background so audits never surprise you.',
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
      'Load delivered? Verify the paperwork — POD, signatures, accessorials. This is your quality gate before the invoice goes out.',
    selector: '#tour-nav-close-out',
    side: 'right',
    route: '/dispatcher/close-out',
    roles: DISPATCHER_ROLES,
  },
  {
    icon: null,
    title: 'Billing',
    content:
      'Get paid. Generate invoices, track aging, chase overdue customers, sync to QuickBooks. Factoring too, if you use it.',
    selector: '#tour-nav-billing',
    side: 'right',
    route: '/dispatcher/billing',
    roles: DISPATCHER_ROLES,
  },
  {
    icon: null,
    title: 'Pay',
    content:
      'Pay your drivers. Settlements calculate earnings — per mile, percentage, flat rate, accessorials — and push straight to accounting.',
    selector: '#tour-nav-pay',
    side: 'right',
    route: '/dispatcher/pay',
    roles: DISPATCHER_ROLES,
  },
  {
    icon: null,
    title: 'IFTA',
    content:
      'Fuel tax reporting without the spreadsheet. Assistant tracks mileage by jurisdiction as you operate, so quarterly filings take minutes.',
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
      'The bigger picture. Revenue trends, driver performance, lane profitability — the numbers that shape smarter decisions next month.',
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
