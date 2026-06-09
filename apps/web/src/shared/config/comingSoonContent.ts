import type { ComingSoonBannerProps } from '@/features/platform/feature-flags';

/**
 * Marketing content for coming soon banners.
 * Keys match feature flag keys (operational kill-switches).
 * Shown when a feature flag is OFF (maintenance / not-yet-launched).
 */
export const comingSoonContent: Record<string, Omit<ComingSoonBannerProps, 'category'>> = {
  voice_mode: {
    title: 'Voice Mode',
    description:
      'Talk to Assistant hands-free with speech-to-text and text-to-speech — perfect for drivers on the road.',
    features: [
      'Hands-free voice interaction with Assistant',
      'Speech-to-text powered by Deepgram',
      'Text-to-speech responses via Cartesia',
      'Natural language commands for common operations',
    ],
  },

  doc_intelligence: {
    title: 'Document Intelligence',
    description:
      'Upload rate confirmations and Assistant auto-extracts all load details — customer, origin, destination, rate, and special instructions.',
    features: [
      'Auto-extract from rate-con PDFs using AI vision',
      'Customer, origin, destination, and rate detection',
      'Special instructions and accessorial capture',
      'Save ~8 minutes per load on manual data entry',
    ],
  },

  route_planning: {
    title: 'Smart Route',
    description:
      'Intelligent route optimization that ensures HOS compliance, inserts rest stops, finds optimal fuel stops, and explains every decision transparently.',
    features: [
      'Automatic stop sequence optimization with 2-opt improvement',
      'Smart rest stop insertion based on HOS regulations',
      'Intelligent fuel stop selection based on range, pricing, and fuel cards',
      'Zero-violation guarantee with segment-by-segment HOS simulation',
      'Transparent decision reasoning — see exactly why each choice was made',
    ],
  },

  command_center: {
    title: 'Command Center',
    description: 'Mission control dashboard with fleet overview, AI briefings, attention feed, and shift notes.',
    features: [
      'Fleet-wide overview with driver status, active routes, and alerts',
      "Daily AI briefing summarizing overnight events and today's priorities",
      'Real-time attention feed showing items needing action',
      'Monitoring pill with live fleet health status',
      'Shift notes for seamless dispatcher handoffs',
    ],
  },

  shield: {
    title: 'Shield Compliance',
    description:
      'AI-powered DOT audit readiness that monitors fleet compliance across HOS, driver qualifications, vehicles, and loads.',
    features: [
      'Fleet-wide Shield Score (0–100) showing instant DOT audit readiness',
      'Four compliance pillars: HOS, Driver Qualification, Vehicle, Load Documentation',
      'AI-powered cross-entity analysis finds risks rule-based checks miss',
      'On-demand or scheduled daily audits with per-entity drill-down',
      'Actionable findings with severity, impact, and recommended next steps',
    ],
  },

  continuous_monitoring: {
    title: 'Continuous Monitoring',
    description:
      'Background service monitoring 14 trigger types every 60 seconds — proactively catching issues before they escalate.',
    features: [
      '14 trigger types across 5 categories monitored every 60 seconds',
      'Proactive HOS monitoring to prevent violations',
      'Weather, traffic, and dock delay integration',
      'Automatic alert creation when conditions require attention',
      'Zero-click monitoring — the system watches everything for you',
    ],
  },

  alerts: {
    title: 'Alerts System',
    description: 'Proactive notifications for HOS violations, route delays, and critical events.',
    features: [
      'HOS violation alerts: approaching limits, rest required, available hours low',
      'Route delay notifications: driver not moving, stuck at dock, traffic delays',
      'Critical event alerts: weather warnings, route deviations, missed stops',
      'Customizable alert thresholds and notification preferences',
      'Alert acknowledgment and resolution tracking',
    ],
  },

  close_out: {
    title: 'Close Out',
    description: 'Review delivered loads, verify documents, and approve for billing before invoicing.',
    features: [
      'Delivered load queue with document verification status',
      'POD and BOL verification workflow',
      'One-click approval for billing',
      'Overdue document tracking and alerts',
    ],
  },

  billing: {
    title: 'Billing',
    description: 'Create, send, and track invoices with automatic rate calculation from load data.',
    features: [
      'One-click invoice generation from completed loads',
      'Line item management with accessorials, detention, and lumper charges',
      'Invoice status tracking: draft, sent, paid, overdue',
      'Bulk invoicing for multiple loads to the same customer',
      'QuickBooks sync for seamless accounting',
    ],
  },

  driver_pay: {
    title: 'Driver Pay',
    description: 'Calculate and manage driver pay with per-mile, percentage, flat rate, and hybrid support.',
    features: [
      'Flexible pay structures: per-mile, percentage, flat rate, or hybrid',
      'Automatic settlement calculation from completed loads',
      'Deduction management: advances, fuel cards, insurance',
      'Settlement statement generation with detailed pay breakdown',
    ],
  },

  samsara_integration: {
    title: 'Samsara Integration',
    description: 'Connect Samsara for real-time ELD sync, HOS data, and vehicle telematics.',
    features: [
      'Real-time ELD data sync for all drivers',
      'HOS compliance tracking with automatic updates',
      'Vehicle telematics: location, speed, fuel level',
      'Automatic driver status updates from duty status changes',
    ],
  },

  tms_integration: {
    title: 'TMS Integration',
    description: 'Connect external TMS systems for automatic driver, vehicle, and load data sync.',
    features: [
      'Automatic driver and vehicle import from external TMS',
      'Load data sync with status updates',
      'Two-way reconciliation between the platform and your TMS',
      'Support for McLeod, TMW, and other major providers',
    ],
  },

  quickbooks_integration: {
    title: 'QuickBooks Integration',
    description: 'Sync invoices and settlements to QuickBooks for seamless two-way accounting.',
    features: [
      'One-click QuickBooks Online connection with OAuth',
      'Automatic invoice sync as they are created',
      'Settlement sync for driver pay and deductions',
      'Customer and vendor mapping between the platform and QuickBooks',
      'Reconciliation dashboard showing sync status',
    ],
  },
};
