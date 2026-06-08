'use client';

import { Badge } from '@sally/ui/components/ui/badge';

interface AccountingSyncBadgeProps {
  externalId: string | null;
  syncedAt: string | null;
  syncError: string | null;
}

export function AccountingSyncBadge({ externalId: _externalId, syncedAt, syncError }: AccountingSyncBadgeProps) {
  if (syncError) {
    return (
      <Badge variant="destructive" className="text-xs">
        Sync Failed
      </Badge>
    );
  }
  if (syncedAt) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground border-border">
        Synced
      </Badge>
    );
  }
  return <span className="text-xs text-muted-foreground">—</span>;
}
