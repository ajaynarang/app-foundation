'use client';

import { useMemo } from 'react';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { useTenantApiKeys } from '@/features/platform/api-keys';

interface ApiKeyProfileTabProps {
  apiKeyId: number;
}

export function ApiKeyProfileTab({ apiKeyId }: ApiKeyProfileTabProps) {
  const { data: keys, isLoading } = useTenantApiKeys();

  const apiKey = useMemo(() => keys?.find((k) => k.id === apiKeyId) ?? null, [keys, apiKeyId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-64" />
      </div>
    );
  }

  if (!apiKey) {
    return <p className="text-sm text-muted-foreground">API key not found.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Name</p>
        <p className="text-sm text-foreground">{apiKey.name}</p>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Key</p>
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs text-foreground">{apiKey.keyMasked}</code>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">Rate limit</p>
          <p className="text-sm text-foreground">{apiKey.rateLimitPerMinute}/min</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">Last used</p>
          <p className="text-sm text-foreground">
            {apiKey.lastUsedAt ? new Date(apiKey.lastUsedAt).toLocaleString() : 'Never'}
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">IP Allowlist</p>
        {apiKey.ipAllowlist.length === 0 ? (
          <p className="text-sm text-muted-foreground">No IP restriction — key accepted from any origin.</p>
        ) : (
          <ul className="space-y-1">
            {apiKey.ipAllowlist.map((cidr) => (
              <li key={cidr} className="font-mono text-xs text-foreground">
                {cidr}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
        <Badge variant={apiKey.revokedAt ? 'critical' : apiKey.isActive ? 'info' : 'muted'}>
          {apiKey.revokedAt ? 'Revoked' : apiKey.isActive ? 'Active' : 'Paused'}
        </Badge>
      </div>
    </div>
  );
}
