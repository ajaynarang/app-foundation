import type { SallyCapabilities, SallyCapabilityCategory, SallyQuickAction, SallyUserMode } from '@app/shared-types';

/**
 * Capability registry — single source of truth for "what can Sally do?".
 *
 * - Quick actions surface at the top of the palette per role; selecting one
 *   drafts the prompt into the textarea (we never auto-fire — see palette).
 * - Categories provide the full discoverable surface, grouped for scanning.
 *
 * Keep example prompts short and natural. The example string is what gets
 * dropped into the textarea, so it has to read like something a user would
 * actually type.
 *
 * Adding new entries: keep ids stable across deploys (used as React keys
 * and analytics tokens). Group by what the user is trying to do, not by
 * which MCP tool backs it.
 */

const PROSPECT_QUICK: SallyQuickAction[] = [
  { id: 'what-is-sally', label: 'What is SALLY?', hint: 'a 60-second intro', prompt: 'What is SALLY?' },
  { id: 'pricing', label: 'Show pricing plans', hint: 'compare available plans', prompt: 'Can I see pricing plans?' },
];

const DISPATCHER_QUICK: SallyQuickAction[] = [
  {
    id: 'catch-me-up',
    label: 'Catch me up',
    hint: 'briefing on what changed since yesterday',
    prompt: 'Catch me up on what changed since yesterday',
  },
  {
    id: 'needs-me',
    label: 'What needs me right now?',
    hint: 'open alerts and pending decisions',
    prompt: 'What needs my attention right now?',
  },
  {
    id: 'overdue-ar',
    label: 'Show overdue invoices',
    hint: 'AR over 7 days past due',
    prompt: 'Show overdue invoices',
  },
];

const DRIVER_QUICK: SallyQuickAction[] = [
  {
    id: 'my-hos',
    label: 'How much drive time do I have?',
    hint: 'hours of service remaining',
    prompt: 'How much drive time do I have left?',
  },
  {
    id: 'next-stop',
    label: "What's my next stop?",
    hint: 'pickup or delivery details',
    prompt: "What's my next stop?",
  },
  {
    id: 'my-eta',
    label: "What's my current ETA?",
    hint: 'estimated time of arrival',
    prompt: "What's my current ETA?",
  },
];

const OWNER_QUICK: SallyQuickAction[] = [
  {
    id: 'catch-me-up',
    label: 'Catch me up',
    hint: 'briefing on what changed since yesterday',
    prompt: 'Catch me up on what changed since yesterday',
  },
  {
    id: 'needs-me',
    label: 'What needs me right now?',
    hint: 'open alerts and pending decisions',
    prompt: 'What needs my attention right now?',
  },
  {
    id: 'approve-settlements',
    label: 'Approve pending settlements',
    hint: 'review what is awaiting approval',
    prompt: 'Approve pending settlements',
  },
];

const ADMIN_QUICK: SallyQuickAction[] = [
  {
    id: 'catch-me-up',
    label: 'Catch me up',
    hint: 'briefing on what changed since yesterday',
    prompt: 'Catch me up on what changed since yesterday',
  },
  {
    id: 'fleet-status',
    label: 'Fleet status overview',
    hint: 'show fleet at a glance',
    prompt: 'Show fleet status overview',
  },
  {
    id: 'hos-violations',
    label: 'HOS violations today',
    hint: 'drivers over the 11/14 limits',
    prompt: 'Any HOS violations?',
  },
];

const SUPER_ADMIN_QUICK: SallyQuickAction[] = [
  {
    id: 'fleet-status',
    label: 'Fleet status overview',
    hint: 'show fleet at a glance',
    prompt: 'Show fleet status overview',
  },
  {
    id: 'hos-violations',
    label: 'HOS violations today',
    hint: 'drivers over the 11/14 limits',
    prompt: 'Any HOS violations?',
  },
];

const CUSTOMER_QUICK: SallyQuickAction[] = [
  {
    id: 'shipments',
    label: 'Where are my shipments?',
    hint: 'track active deliveries',
    prompt: 'Where are my shipments?',
  },
  { id: 'invoices', label: 'View my invoices', hint: 'show billing and balances', prompt: 'View my invoices' },
];

const SUPPORT_QUICK: SallyQuickAction[] = [
  {
    id: 'ticket-status',
    label: 'Check my ticket status',
    hint: 'show the latest update',
    prompt: 'Check my ticket status',
  },
  {
    id: 'billing-help',
    label: 'I need help with billing',
    hint: 'open a billing ticket',
    prompt: 'I need help with billing',
  },
];

// ── Capability categories per role ──────────────────────────────────────────

const PROSPECT_CATEGORIES: SallyCapabilityCategory[] = [
  {
    title: 'About SALLY',
    items: [
      {
        id: 'about.what-is-sally',
        name: 'What SALLY is',
        description: 'Quick intro to what we do',
        example: 'What is SALLY?',
      },
      {
        id: 'about.routing',
        name: 'How route planning works',
        description: 'Walkthrough of the routing engine',
        example: 'How does route planning work?',
      },
      {
        id: 'about.integrations',
        name: 'Integrations',
        description: 'See which TMS / ELD / accounting we connect with',
        example: 'What integrations do you support?',
      },
      {
        id: 'about.pricing',
        name: 'Pricing plans',
        description: 'Compare available tiers',
        example: 'Can I see pricing plans?',
      },
      {
        id: 'about.vs-tms',
        name: 'SALLY vs a TMS',
        description: 'How SALLY differs from a traditional TMS',
        example: 'How is SALLY different from a TMS?',
      },
    ],
  },
];

const DISPATCHER_CATEGORIES: SallyCapabilityCategory[] = [
  {
    title: 'Fleet & Loads',
    items: [
      {
        id: 'fleet.overview',
        name: 'Fleet overview',
        description: 'Check fleet status at a glance',
        example: 'Show fleet status',
      },
      {
        id: 'loads.search',
        name: 'Search loads',
        description: 'Find loads by status, driver, or customer',
        example: 'Show me all pending loads',
      },
      {
        id: 'loads.detail',
        name: 'Load details',
        description: 'View full details for a specific load',
        example: 'Show me load L-1045',
      },
      {
        id: 'loads.assign',
        name: 'Assign load',
        description: 'Assign a driver and vehicle to a load',
        example: 'Assign driver John to load L-1045',
      },
      {
        id: 'loads.status',
        name: 'Update load status',
        description: 'Change load status (hold, delivered, TONU)',
        example: 'Put load L-1032 on hold',
      },
      {
        id: 'loads.update',
        name: 'Update load info',
        description: 'Change rate, weight, equipment type',
        example: 'Change rate on L-1045 to $3200',
      },
      {
        id: 'loads.note',
        name: 'Add note',
        description: 'Add a note to any load',
        example: 'Note on L-1045: shipper closes at 5pm',
      },
      {
        id: 'loads.duplicate',
        name: 'Duplicate load',
        description: 'Copy an existing load as a new draft',
        example: 'Copy load L-1045',
      },
      {
        id: 'loads.from-lane',
        name: 'Generate from lane',
        description: 'Create a load from a recurring lane',
        example: 'Create a load from the Acme Dallas-Houston lane',
      },
    ],
  },
  {
    title: 'Drivers',
    items: [
      {
        id: 'drivers.find',
        name: 'Find drivers',
        description: 'Search drivers by availability or status',
        example: "Who's available?",
      },
      {
        id: 'drivers.profile',
        name: 'Driver profile',
        description: 'View driver contact info, CDL, medical card',
        example: 'Show me driver John Smith',
      },
      {
        id: 'drivers.hos',
        name: 'Driver HOS',
        description: 'Check hours of service remaining',
        example: "What's John's HOS?",
      },
      {
        id: 'drivers.update',
        name: 'Update driver info',
        description: 'Change phone, email, medical card expiry',
        example: "Update John's phone to 555-1234",
      },
    ],
  },
  {
    title: 'Compliance & Safety',
    items: [
      {
        id: 'compliance.hos',
        name: 'HOS violations',
        description: 'List drivers over the 11/14 limits',
        example: 'Any HOS violations?',
      },
      {
        id: 'compliance.audit',
        name: 'Compliance overview',
        description: 'Summary of fleet compliance posture',
        example: "How's our compliance looking?",
      },
    ],
  },
  {
    title: 'Financials',
    items: [
      {
        id: 'financials.ready-to-invoice',
        name: 'Ready to invoice',
        description: 'Loads delivered with no invoice yet',
        example: 'What loads are ready to invoice?',
      },
      {
        id: 'financials.overdue',
        name: 'Overdue invoices',
        description: 'AR aged over 7 days past due',
        example: 'Show overdue invoices',
      },
      {
        id: 'financials.ifta',
        name: 'IFTA liability',
        description: 'Estimated IFTA owed this quarter',
        example: "What's our IFTA liability this quarter?",
      },
    ],
  },
];

const DRIVER_CATEGORIES: SallyCapabilityCategory[] = [
  {
    title: 'My driving',
    items: [
      {
        id: 'driver.hos',
        name: 'How much drive time do I have left?',
        description: 'Hours of service remaining',
        example: 'How much drive time do I have left?',
      },
      {
        id: 'driver.next-stop',
        name: "What's my next stop?",
        description: 'Pickup or delivery details',
        example: "What's my next stop?",
      },
      {
        id: 'driver.next-break',
        name: 'When is my next break?',
        description: 'HOS break window',
        example: 'When is my next break?',
      },
      {
        id: 'driver.eta',
        name: "What's my current ETA?",
        description: 'Estimated time of arrival',
        example: "What's my current ETA?",
      },
      {
        id: 'driver.settlement',
        name: 'Show my settlement',
        description: 'Pay for the current period',
        example: 'Show my settlement',
      },
    ],
  },
];

const OWNER_CATEGORIES: SallyCapabilityCategory[] = DISPATCHER_CATEGORIES;
const ADMIN_CATEGORIES: SallyCapabilityCategory[] = DISPATCHER_CATEGORIES;

const SUPER_ADMIN_CATEGORIES: SallyCapabilityCategory[] = [
  {
    title: 'Platform overview',
    items: [
      {
        id: 'platform.fleet-status',
        name: 'Fleet status overview',
        description: 'Show fleet at a glance',
        example: 'Show fleet status overview',
      },
      {
        id: 'platform.compliance',
        name: 'Compliance overview',
        description: 'Cross-tenant compliance posture',
        example: "How's compliance looking?",
      },
      {
        id: 'platform.alerts',
        name: 'Active alerts',
        description: 'Cross-tenant active alerts',
        example: 'Any active alerts?',
      },
    ],
  },
];

const CUSTOMER_CATEGORIES: SallyCapabilityCategory[] = [
  {
    title: 'My shipments',
    items: [
      {
        id: 'customer.shipments',
        name: 'Where are my shipments?',
        description: 'Track active deliveries',
        example: 'Where are my shipments?',
      },
      {
        id: 'customer.track',
        name: 'Track my latest delivery',
        description: 'Latest delivery status',
        example: 'Track my latest delivery',
      },
      {
        id: 'customer.documents',
        name: 'Find my documents',
        description: 'Look up BOLs, PODs, invoices',
        example: 'Find my documents',
      },
      {
        id: 'customer.invoices',
        name: 'View my invoices',
        description: 'Open invoices and balances',
        example: 'View my invoices',
      },
      { id: 'customer.balance', name: 'What do I owe?', description: 'Current balance due', example: 'What do I owe?' },
    ],
  },
];

const SUPPORT_CATEGORIES: SallyCapabilityCategory[] = [
  {
    title: 'Tickets',
    items: [
      {
        id: 'support.status',
        name: 'Check my ticket status',
        description: 'Latest update on your ticket',
        example: 'Check my ticket status',
      },
      {
        id: 'support.billing',
        name: 'Help with billing',
        description: 'Open a billing ticket',
        example: 'I need help with billing',
      },
      {
        id: 'support.tech',
        name: 'Report a technical issue',
        description: 'Open a technical ticket',
        example: 'Report a technical issue',
      },
      {
        id: 'support.feature',
        name: 'Request a feature',
        description: 'Submit a product request',
        example: 'Request a feature',
      },
      {
        id: 'support.contact',
        name: 'Contact support',
        description: 'Get a human on the line',
        example: 'Contact support',
      },
    ],
  },
];

const REGISTRY: Record<SallyUserMode, SallyCapabilities> = {
  prospect: { mode: 'prospect', quickActions: PROSPECT_QUICK, categories: PROSPECT_CATEGORIES },
  dispatcher: { mode: 'dispatcher', quickActions: DISPATCHER_QUICK, categories: DISPATCHER_CATEGORIES },
  driver: { mode: 'driver', quickActions: DRIVER_QUICK, categories: DRIVER_CATEGORIES },
  owner: { mode: 'owner', quickActions: OWNER_QUICK, categories: OWNER_CATEGORIES },
  admin: { mode: 'admin', quickActions: ADMIN_QUICK, categories: ADMIN_CATEGORIES },
  super_admin: { mode: 'super_admin', quickActions: SUPER_ADMIN_QUICK, categories: SUPER_ADMIN_CATEGORIES },
  customer: { mode: 'customer', quickActions: CUSTOMER_QUICK, categories: CUSTOMER_CATEGORIES },
  support: { mode: 'support', quickActions: SUPPORT_QUICK, categories: SUPPORT_CATEGORIES },
};

export function getCapabilitiesForMode(mode: SallyUserMode): SallyCapabilities {
  return REGISTRY[mode];
}
