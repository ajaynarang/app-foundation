'use client';

import { ArrowLeft } from 'lucide-react';

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

/**
 * Header navigation for docs-only mode.
 * Shows a single "Back to App" link that returns the user to the main app.
 */
export function DocsOnlyHeaderLinks() {
  return (
    <a
      href={appUrl}
      className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium h-8 px-3 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      <span>Back to App</span>
    </a>
  );
}
