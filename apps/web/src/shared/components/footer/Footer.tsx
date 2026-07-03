'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { mailto } from '@appshore/web-core/shared/lib/contacts';
import { openCookiePreferences } from '@/shared/components/cookie-consent';

const consoleUrl = process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3002';

const linkGroups: { label: string; href: string; external?: boolean }[][] = [
  [
    {
      label: 'API Docs',
      href: `${consoleUrl}/docs`,
      external: true,
    },
    {
      label: 'Contact',
      href: mailto('app'),
      external: true,
    },
  ],
  [
    { label: 'Privacy', href: '/legal/privacy' },
    { label: 'Terms', href: '/legal/terms' },
    { label: 'Cookies', href: '/legal/cookies' },
  ],
  [
    { label: 'Security', href: '/legal/security' },
    { label: 'AI Transparency', href: '/legal/ai' },
  ],
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 md:py-10">
        {/* Top section: logo + link groups */}
        <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-12">
          {/* Logo + tagline */}
          <div className="flex-shrink-0">
            <Link href="/" className="text-lg font-bold text-foreground font-space-grotesk">
              Platform
            </Link>
            <p className="text-xs text-muted-foreground mt-1">Your platform, ready to build on.</p>
          </div>

          {/* Link groups */}
          <div className="flex flex-wrap gap-x-12 gap-y-6 md:ml-auto">
            {linkGroups.map((group, gi) => (
              <ul key={gi} className="flex flex-col gap-2">
                {group.map((link) =>
                  link.external ? (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
                      >
                        {link.label}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-8 pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-muted-foreground">
          <p>&copy; {year} Platform. All rights reserved.</p>

          <div className="flex items-center gap-2">
            <Link href="/legal/privacy#ccpa" className="hover:text-foreground transition-colors">
              Do Not Sell My Info
            </Link>
            <span className="text-border" aria-hidden="true">
              |
            </span>
            <Button
              variant="ghost"
              className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
              onClick={openCookiePreferences}
            >
              Cookie Preferences
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
}
