'use client';

import Link from 'next/link';
import { Button } from '@app/ui/components/ui/button';
import { Mail } from 'lucide-react';
import type { UserRole } from '@appshore/web-core/shared/lib/navigation';

import { mailto } from '@appshore/web-core/shared/lib/contacts';
import { useAuthStore } from '@/features/auth';
import { helpTopicsFor } from '@/features/platform/support/help-topics';

export default function SupportPage() {
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined;
  const topics = helpTopicsFor(role);

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

      {/* Help Center — only tiles this role can open; hidden when there are none */}
      {topics.length > 0 && (
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
      )}
    </div>
  );
}
