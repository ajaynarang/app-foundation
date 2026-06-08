'use client';

import { Key, ArrowRight } from 'lucide-react';

export function ApiKeyManager() {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center space-y-3 my-4">
      <Key className="h-8 w-8 text-muted-foreground mx-auto" />
      <p className="text-sm text-muted-foreground">API key management has moved to Console.</p>
      <a
        href="/developer/api-keys"
        className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
      >
        Manage API Keys
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  );
}
