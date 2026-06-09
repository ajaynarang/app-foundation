'use client';

import Link from 'next/link';
import { Home, LayoutDashboard } from 'lucide-react';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

interface DocsHeaderLinksProps {
  isAuthenticated: boolean;
}

const linkClass =
  'inline-flex items-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors';

/**
 * Header navigation for docs pages.
 *
 * Authenticated: "App" (same tab → web app) + "Console" (same tab → dashboard)
 * Not authenticated: "Sign In"
 */
export function DocsHeaderLinks({ isAuthenticated }: DocsHeaderLinksProps) {
  if (!isAuthenticated) {
    return (
      <a
        href={`${appUrl}/login`}
        className="inline-flex items-center rounded-md text-sm font-medium h-9 px-4 border border-border bg-background text-foreground hover:bg-muted transition-colors"
      >
        Sign In
      </a>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <a href={`${appUrl}/dispatcher`} className={linkClass}>
        <Home className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">App</span>
      </a>
      <span className="text-border mx-0.5">|</span>
      <Link href="/overview" className={linkClass}>
        <LayoutDashboard className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Console</span>
      </Link>
    </div>
  );
}
