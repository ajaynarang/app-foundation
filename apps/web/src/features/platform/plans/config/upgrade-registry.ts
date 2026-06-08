import {
  Mic,
  Sparkles,
  Plug,
  Key,
  Webhook,
  Shield,
  Users,
  ScrollText,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import { FEATURE_KEYS } from '@app/shared-types';

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
  [FEATURE_KEYS.AUDIT_LOG]: {
    displayName: 'Audit Log',
    description: 'A searchable, exportable record of every action taken across your workspace.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$9/mo',
    addOnSlug: 'audit_log',
    icon: ScrollText,
    benefits: [
      'Full activity history across the workspace',
      'Filter by user, action, and date range',
      'Exportable records for compliance',
      'Tamper-evident event trail',
    ],
  },
  [FEATURE_KEYS.DESK]: {
    displayName: 'Desk Automations',
    description: 'Background agents that handle recurring work on your behalf.',
    requiredPlan: null,
    isAddOn: true,
    addOnPrice: '$19/mo',
    addOnSlug: 'desk',
    icon: ListChecks,
    benefits: [
      'Automate recurring multi-step tasks',
      'Human-in-the-loop approvals',
      'Scheduled and event-driven runs',
      'Full run history and audit trail',
    ],
  },

  // ─── Entitlement features (plan tier upgrades) ─────────────────────────
  [FEATURE_KEYS.TEAM_MANAGEMENT]: {
    displayName: 'Team Management',
    description: 'Invite teammates, assign roles, and manage access across your workspace.',
    requiredPlan: 'Professional',
    isAddOn: false,
    icon: Users,
    benefits: [
      'Invite unlimited teammates',
      'Role-based access control',
      'Per-member activity visibility',
      'Centralized seat management',
    ],
  },
  [FEATURE_KEYS.VOICE_MODE]: {
    displayName: 'Voice Mode',
    description: 'Talk to the assistant hands-free with speech-to-text and text-to-speech.',
    requiredPlan: 'Professional',
    isAddOn: false,
    icon: Mic,
    benefits: [
      'Hands-free voice interaction',
      'Speech-to-text and text-to-speech',
      'Natural language commands',
      'Great for on-the-go use',
    ],
  },
  [FEATURE_KEYS.AI_CHAT]: {
    displayName: 'AI Assistant',
    description: 'Let the assistant take actions on your behalf across your workspace.',
    requiredPlan: 'Professional',
    isAddOn: false,
    icon: Sparkles,
    benefits: [
      'Natural language commands',
      'Pluggable tool actions',
      'Streaming responses',
      'Human-in-the-loop confirmations',
    ],
  },
  [FEATURE_KEYS.INTEGRATIONS]: {
    displayName: 'Integrations',
    description: 'Connect third-party services and sync data into your workspace.',
    requiredPlan: 'Professional',
    isAddOn: false,
    icon: Plug,
    benefits: [
      'Connect external services',
      'Two-way data sync',
      'OAuth and API-key connectors',
      'Managed credential storage',
    ],
  },
  [FEATURE_KEYS.API_KEYS]: {
    displayName: 'API Keys',
    description: 'Create and manage API keys for programmatic access.',
    requiredPlan: 'Enterprise',
    isAddOn: false,
    icon: Key,
    benefits: ['Programmatic API access', 'Usage tracking', 'Key rotation', 'Rate limit management'],
  },
  [FEATURE_KEYS.WEBHOOKS]: {
    displayName: 'Webhooks',
    description: 'Receive real-time event notifications via HTTP endpoints.',
    requiredPlan: 'Enterprise',
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
    requiredPlan: 'Enterprise',
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
