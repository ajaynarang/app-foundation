import {
  Route,
  Home,
  ShieldCheck,
  AlertTriangle,
  Radio,
  Mic,
  FileText,
  BarChart3,
  Plug,
  Key,
  Webhook,
  Shield,
  ArrowLeftRight,
  Fuel,
  type LucideIcon,
} from 'lucide-react';
import { FEATURE_KEYS } from '@sally/shared-types';

export interface UpgradeFeatureConfig {
  displayName: string;
  description: string;
  requiredPlan: string | null; // null for add-ons (not a plan upgrade)
  icon: LucideIcon;
  benefits: string[]; // 3-4 bullet points for the upgrade pitch
  isAddOn: boolean;
  addOnPrice?: string; // e.g. '$29/mo'
  addOnSlug?: string; // slug for request API
}

export const upgradeRegistry: Record<string, UpgradeFeatureConfig> = {
  // ─── Add-on features (purchasable separately) ──────────────────────────
  [FEATURE_KEYS.COMMAND_CENTER]: {
    displayName: 'Command Center',
    description: 'Mission control for your fleet with AI briefings, attention feed, and shift notes.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$9/mo',
    addOnSlug: 'command_center',
    icon: Home,
    benefits: [
      'Daily AI briefing summarizing overnight events',
      'Real-time attention feed with one-click actions',
      'Monitoring pill showing live fleet status',
      'Shift notes for seamless handoffs',
    ],
  },
  [FEATURE_KEYS.ROUTE_PLANNING]: {
    displayName: 'Smart Route',
    description:
      'Optimized routes with HOS compliance, automatic rest stops, fuel savings, and transparent decision reasoning.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$19/mo',
    addOnSlug: 'route_planning',
    icon: Route,
    benefits: [
      'HOS-compliant route optimization',
      'Automatic rest and fuel stop insertion',
      'Real-time ETA with weather awareness',
      'Transparent decision reasoning',
    ],
  },
  [FEATURE_KEYS.SHIELD]: {
    displayName: 'Shield Compliance',
    description: 'Automated DOT compliance monitoring and audit-readiness scoring.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$29/mo',
    addOnSlug: 'shield_compliance',
    icon: ShieldCheck,
    benefits: ['Compliance scoring', 'DVIR tracking', 'Audit-ready reports', 'Proactive violation detection'],
  },
  [FEATURE_KEYS.CONTINUOUS_MONITORING]: {
    displayName: 'Continuous Monitoring',
    description: 'Background service checking 14 trigger types every 60 seconds.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$14/mo',
    addOnSlug: 'continuous_monitoring',
    icon: Radio,
    benefits: [
      '14 monitoring trigger types',
      '60-second check intervals',
      'Automatic alert creation',
      'Driver HOS and location tracking',
    ],
  },
  [FEATURE_KEYS.DOC_INTELLIGENCE]: {
    displayName: 'Document Intelligence',
    description: 'Upload rate confirmations and Sally auto-extracts all load details.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$9/mo',
    addOnSlug: 'doc_intelligence',
    icon: FileText,
    benefits: [
      'Auto-extract from rate-con PDFs',
      'Customer, origin, destination, rate',
      'Special instructions captured',
      'Save ~8 minutes per load',
    ],
  },
  [FEATURE_KEYS.INSIGHTS]: {
    displayName: 'Insights & Analytics',
    description: 'Advanced reporting and analytics for fleet performance and profitability.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$9/mo',
    addOnSlug: 'insights',
    icon: BarChart3,
    benefits: [
      'Revenue and profitability reports',
      'Driver performance analytics',
      'Operational efficiency metrics',
      'Customizable dashboards',
    ],
  },
  [FEATURE_KEYS.IFTA]: {
    displayName: 'IFTA Reporting',
    description: 'Automated fuel tax reporting with mileage tracking by jurisdiction.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$14/mo',
    addOnSlug: 'ifta',
    icon: Fuel,
    benefits: [
      'Automated mileage tracking by state',
      'Fuel purchase reconciliation',
      'Quarterly IFTA report generation',
      'Jurisdiction-level breakdowns',
    ],
  },
  [FEATURE_KEYS.EDI_INTEGRATION]: {
    displayName: 'EDI Integration',
    description: 'Electronic Data Interchange for automated load tenders and status updates.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$39/mo',
    addOnSlug: 'edi_integration',
    icon: ArrowLeftRight,
    benefits: [
      'Automated load tenders (204/990)',
      'Status updates (214)',
      'Invoice exchange (210)',
      'Trading partner management',
    ],
  },

  // ─── Entitlement features (plan tier upgrades) ─────────────────────────
  [FEATURE_KEYS.ALERTS]: {
    displayName: 'Alerts System',
    description: 'Proactive notifications for HOS violations, delays, and critical events.',
    requiredPlan: 'Fleet',
    isAddOn: false,
    icon: AlertTriangle,
    benefits: [
      'Automatic HOS violation detection',
      'Delay and ETA change alerts',
      'Priority-based alert routing',
      'One-click acknowledge and resolve',
    ],
  },
  [FEATURE_KEYS.VOICE_MODE]: {
    displayName: 'Voice Mode',
    description: 'Talk to Sally hands-free — perfect for drivers on the road.',
    requiredPlan: 'Fleet',
    isAddOn: false,
    icon: Mic,
    benefits: [
      'Hands-free voice interaction',
      'Speech-to-text and text-to-speech',
      'Works for drivers and dispatchers',
      'Natural language commands',
    ],
  },
  [FEATURE_KEYS.SALLY_AI_ACTIONS]: {
    displayName: 'Sally AI Actions',
    description: 'Let Sally take actions on your behalf — plan routes, generate invoices, and more.',
    requiredPlan: 'Fleet',
    isAddOn: false,
    icon: BarChart3,
    benefits: [
      '20+ MCP action tools',
      'Plan routes, generate invoices',
      'Check HOS, query fleet data',
      'Natural language commands',
    ],
  },
  [FEATURE_KEYS.LOAD_BOARD]: {
    displayName: 'Load Board',
    description: 'Search the DAT spot market for available loads with lane intelligence and smart matching.',
    requiredPlan: 'Fleet',
    isAddOn: false,
    icon: Plug,
    benefits: [
      'Search DAT spot market listings',
      'Lane intelligence with rate comparisons',
      'NLP-powered natural language search',
      'One-click import to create draft loads',
    ],
  },
  [FEATURE_KEYS.SAMSARA_INTEGRATION]: {
    displayName: 'Samsara Integration',
    description: 'Connect Samsara for ELD sync, HOS data, and vehicle telematics.',
    requiredPlan: 'Fleet',
    isAddOn: false,
    icon: Plug,
    benefits: [
      'Real-time ELD data sync',
      'HOS compliance tracking',
      'Vehicle telematics and location',
      'Automatic driver status updates',
    ],
  },
  [FEATURE_KEYS.QUICKBOOKS_INTEGRATION]: {
    displayName: 'QuickBooks Integration',
    description: 'Sync invoices and settlements directly to QuickBooks.',
    requiredPlan: 'Freight Force',
    isAddOn: false,
    icon: Plug,
    benefits: ['Automatic invoice sync', 'Settlement export', 'Two-way reconciliation', 'Chart of accounts mapping'],
  },
  [FEATURE_KEYS.TMS_INTEGRATION]: {
    displayName: 'TMS Integration',
    description: 'Connect external TMS systems for data sync.',
    requiredPlan: 'Freight Force',
    isAddOn: false,
    icon: Plug,
    benefits: ['External TMS data sync', 'Load import/export', 'Driver and vehicle sync', 'Automated reconciliation'],
  },
  [FEATURE_KEYS.CUSTOM_INTEGRATIONS]: {
    displayName: 'Custom Integrations',
    description: 'Build custom API connectors for your specific systems.',
    requiredPlan: 'Freight Force',
    isAddOn: false,
    icon: Plug,
    benefits: [
      'Custom API adapters',
      'Vendor-specific connectors',
      'Data transformation rules',
      'Dedicated integration support',
    ],
  },
  [FEATURE_KEYS.API_KEYS]: {
    displayName: 'API Keys',
    description: 'Create and manage API keys for programmatic access.',
    requiredPlan: 'Freight Force',
    isAddOn: false,
    icon: Key,
    benefits: ['Programmatic API access', 'Usage tracking', 'Key rotation', 'Rate limit management'],
  },
  [FEATURE_KEYS.WEBHOOKS]: {
    displayName: 'Webhooks',
    description: 'Receive real-time event notifications via HTTP endpoints.',
    requiredPlan: 'Freight Force',
    isAddOn: false,
    icon: Webhook,
    benefits: [
      'Real-time event delivery',
      'Delivery logs and retry',
      'Custom event filtering',
      'Endpoint health monitoring',
    ],
  },
  [FEATURE_KEYS.OAUTH_CLIENTS]: {
    displayName: 'OAuth Clients',
    description: 'Register OAuth applications for secure third-party access.',
    requiredPlan: 'Freight Force',
    isAddOn: false,
    icon: Shield,
    benefits: [
      'OAuth 2.0 client registration',
      'Redirect URI management',
      'Scope-based access control',
      'Token lifecycle management',
    ],
  },
};
