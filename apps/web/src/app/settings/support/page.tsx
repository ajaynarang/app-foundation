'use client';

import Link from 'next/link';
import { Button } from '@app/ui/components/ui/button';
import { Mail, MessageSquare, CreditCard, Settings, Users, type LucideIcon } from 'lucide-react';
import { USER_ROLES, type UserRoleValue } from '@app/shared-types';

import { mailto } from '@appshore/web-core/shared/lib/contacts';
import { useAuthStore } from '@/features/auth';

// ─── Help Center topics ───

interface HelpTopic {
  icon: LucideIcon;
  title: string;
  desc: string;
  /** The Settings screen where the topic is handled. */
  href: string;
  /** Screens only these roles can open; omitted means everyone. */
  roles?: ReadonlyArray<UserRoleValue>;
}

const ADMIN_ROLES: ReadonlyArray<UserRoleValue> = [USER_ROLES.OWNER, USER_ROLES.ADMIN];

const HELP_TOPICS: HelpTopic[] = [
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
    roles: ADMIN_ROLES,
  },
  {
    icon: Settings,
    title: 'Developer Tools',
    desc: 'API keys, webhooks, OAuth clients, and AI assistants',
    href: '/settings/api-keys',
    roles: ADMIN_ROLES,
  },
  {
    icon: Users,
    title: 'Account & Team',
    desc: 'Manage users, roles, invitations, and organization settings',
    href: '/settings/members',
    roles: ADMIN_ROLES,
  },
];

export default function SupportPage() {
  const role = useAuthStore((s) => s.user?.role) as UserRoleValue | undefined;
  const topics = HELP_TOPICS.filter((topic) => !topic.roles || (!!role && topic.roles.includes(role)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Support</h1>
        <p className="text-sm text-muted-foreground mt-1">We&apos;re here when you need us</p>
      </div>

      {/* Contact support */}
      <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-between max-w-lg">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Need a hand?</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Email our support team and we&apos;ll get back to you.</p>
        </div>
        <a href={mailto('support', 'Support request')}>
          <Button size="sm" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Contact Support
          </Button>
        </a>
      </div>

      {/* Help Center */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Help Center</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {topics.map((topic) => {
            const Icon = topic.icon;
            return (
              <Link
                key={topic.title}
                href={topic.href}
                className="rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/30 transition-colors"
              >
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center mb-3">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <h3 className="text-sm font-medium text-foreground mb-1">{topic.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{topic.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
