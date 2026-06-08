'use client';

import { Button } from '@app/ui/components/ui/button';
import { BookOpen, ExternalLink, Mail, MessageSquare, CreditCard, Plug, Settings, Users } from 'lucide-react';

import { CONSOLE_URL } from '@/shared/lib/navigation';
import { mailto } from '@/shared/lib/contacts';

// ─── Help Center topics ───

const HELP_TOPICS = [
  {
    icon: MessageSquare,
    title: 'Getting Started',
    desc: 'Set up your workspace, invite teammates, and explore the basics',
    href: '/docs/manual/getting-started/welcome',
  },
  {
    icon: CreditCard,
    title: 'Billing & Subscription',
    desc: 'Manage your plan, payment methods, and invoices',
    href: '/docs/manual/web-app/admin/tenant-settings',
  },
  {
    icon: Plug,
    title: 'Integrations',
    desc: 'Connect external services to your workspace',
    href: '/docs/manual/web-app/admin/tenant-settings',
  },
  {
    icon: Settings,
    title: 'Developer Tools',
    desc: 'API keys, webhooks, OAuth clients, and the public API',
    href: '/docs/manual/web-app/admin/tenant-settings',
  },
  {
    icon: Users,
    title: 'Account & Team',
    desc: 'Manage users, roles, invitations, and organization settings',
    href: '/docs/manual/web-app/admin/tenant-settings',
  },
];

export default function SupportPage() {
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
          {HELP_TOPICS.map((topic) => {
            const Icon = topic.icon;
            return (
              <a
                key={topic.title}
                href={`${CONSOLE_URL}${topic.href}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-border bg-card p-4 hover:border-muted-foreground/30 transition-colors group"
              >
                <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center mb-3">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div className="flex items-center gap-1 mb-1">
                  <h3 className="text-sm font-medium text-foreground">{topic.title}</h3>
                  <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{topic.desc}</p>
              </a>
            );
          })}
        </div>

        <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between max-w-lg">
          <div>
            <h3 className="text-sm font-medium text-foreground">Can&apos;t find what you&apos;re looking for?</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Browse the full documentation</p>
          </div>
          <a href={`${CONSOLE_URL}/docs`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Browse Docs
            </Button>
          </a>
        </div>
      </section>
    </div>
  );
}
