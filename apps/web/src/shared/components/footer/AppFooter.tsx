'use client';

import Link from 'next/link';
import { openCookiePreferences } from '@/shared/components/cookie-consent';

/**
 * Minimal centered footer for authenticated pages (dispatcher, admin, console).
 * Dot-separated: © Platform · Privacy · Terms · Cookie Preferences
 */
export function AppFooter() {
  return (
    <footer className="border-t border-border py-3 px-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/60 select-none">
      <span>&copy; {new Date().getFullYear()} Platform</span>
      <Dot />
      <Link href="/legal/privacy" className="hover:text-muted-foreground transition-colors">
        Privacy
      </Link>
      <Dot />
      <Link href="/legal/terms" className="hover:text-muted-foreground transition-colors">
        Terms
      </Link>
      <Dot />
      <button onClick={openCookiePreferences} className="hover:text-muted-foreground transition-colors">
        Cookie Preferences
      </button>
    </footer>
  );
}

function Dot() {
  return (
    <span className="text-border" aria-hidden="true">
      ·
    </span>
  );
}
