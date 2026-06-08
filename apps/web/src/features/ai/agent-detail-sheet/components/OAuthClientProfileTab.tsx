'use client';

import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showSuccess } from '@sally/ui';
import { Copy } from 'lucide-react';
import { useOAuthClientDetail } from '@/features/platform/oauth-clients/hooks/use-tenant-oauth-clients';

interface OAuthClientProfileTabProps {
  clientId: string;
}

export function OAuthClientProfileTab({ clientId }: OAuthClientProfileTabProps) {
  const { data, isLoading } = useOAuthClientDetail(clientId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-64" />
        <Skeleton className="h-5 w-48" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground">OAuth client not found or was revoked.</p>;
  }

  const handleCopy = async (value: string) => {
    await navigator.clipboard.writeText(value);
    showSuccess('Copied to clipboard');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Name</p>
        <p className="text-sm text-foreground">{data.name}</p>
      </div>

      {data.description && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">Description</p>
          <p className="text-sm text-foreground">{data.description}</p>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Client ID</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 rounded bg-muted px-2 py-1 font-mono text-xs text-foreground break-all">
            {data.clientId}
          </code>
          <Button size="sm" variant="outline" onClick={() => handleCopy(data.clientId)}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Redirect URIs</p>
        <ul className="space-y-1">
          {data.redirectUris.map((uri) => (
            <li key={uri} className="font-mono text-xs text-foreground break-all">
              {uri}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Status</p>
        <Badge variant={data.isActive ? 'info' : 'muted'}>{data.isActive ? 'Active' : 'Paused'}</Badge>
      </div>
    </div>
  );
}
