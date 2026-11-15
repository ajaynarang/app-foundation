'use client';

import Link from 'next/link';
import { Button } from '@app/ui/components/ui/button';
import { Mail } from 'lucide-react';
import type { UserRole } from '@appshore/web-core/shared/lib/navigation';

import { mailto } from '@appshore/web-core/shared/lib/contacts';
import { useAuthStore } from '@/features/auth';
import { helpTopicsFor } from '@/features/platform/support/help-topics';
import { PageHeader, PageSection } from '@/shared/components/page-chrome';

export default function SupportPage() {
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined;
  const topics = helpTopicsFor(role);

  return (
    <div className="space-y-6">
      <PageHeader title="Support" subtitle="We're here when you need us" />

      {/* Contact support */}
      <div className="rounded-lg border border-border bg-card p-5 flex items-center justify-between max-w-lg">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Need a hand?</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Email our support team and we&apos;ll get back to you.</p>
        </div>
        <a href={mailto('support', 'Support request')}>
          <Button size="sm" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Contact Support
          </Button>
        </a>
      </div>

      {/* Help Center — only tiles this role can open; hidden when there are none */}
      {topics.length > 0 && (
        <PageSection title="Help Center">
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
        </PageSection>
      )}
    </div>
  );
}
