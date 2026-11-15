import { CreditCard, MessageSquare, Settings, Users, type LucideIcon } from 'lucide-react';
import { canRoleOpen, type UserRole } from '@appshore/web-core/shared/lib/navigation';

/** A Help Center tile on Settings > Support. */
export interface HelpTopic {
  icon: LucideIcon;
  title: string;
  desc: string;
  /** The screen where the topic is handled. */
  href: string;
}

export const HELP_TOPICS: ReadonlyArray<HelpTopic> = [
  {
    icon: MessageSquare,
    title: 'Getting Started',
    desc: 'Set up your workspace, invite teammates, and explore the basics',
    href: '/onboarding',
  },
  {
    icon: CreditCard,
    title: 'Billing & Subscription',
    desc: 'Manage your plan, payment methods, and invoices',
    href: '/settings/subscription',
  },
  {
    icon: Settings,
    title: 'Developer Tools',
    desc: 'API keys, webhooks, OAuth clients, and AI assistants',
    href: '/settings/api-keys',
  },
  {
    icon: Users,
    title: 'Account & Team',
    desc: 'Manage users, roles, invitations, and organization settings',
    href: '/settings/members',
  },
];

/**
 * The tiles a role sees: those whose target it can open. A tile carries no role
 * list of its own, so it cannot disagree with the screen it links to.
 */
export function helpTopicsFor(role: UserRole | undefined): HelpTopic[] {
  return HELP_TOPICS.filter((topic) => canRoleOpen(topic.href, role));
}
