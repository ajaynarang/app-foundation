'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { useTenantApiKeys } from '../hooks/use-tenant-api-keys';
import type { TenantApiKeyListItem } from '../api';
import { AgentDetailSheet } from '@/features/ai/agent-detail-sheet';
import { credentialStatus } from '@/features/ai/agent-scope-ui';
import { ApiKeyMintSheet } from './ApiKeyMintSheet';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  PageSection,
  RowActions,
} from '@/shared/components/page-chrome';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

function summariseScopes(scopes: readonly string[]): string {
  if (scopes.length === 0) return 'None';
  if (scopes.length <= 3) return scopes.join(', ');
  return `${scopes.slice(0, 3).join(', ')} +${scopes.length - 3} more`;
}

function renderStatus(key: TenantApiKeyListItem) {
  const status = credentialStatus(key);
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}

export function ApiKeysPage() {
  const keys = useTenantApiKeys();
  const { formatDate } = useFormatters();
  const { data, isLoading } = keys;
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mintOpen, setMintOpen] = useState(false);

  const open = (key: TenantApiKeyListItem) => {
    setSelectedId(key.id);
    setDetailOpen(true);
  };

  return (
    <PageSection
      title="API keys"
      description="Scoped API keys for scripts, BI tools, and private agents that connect to your tenant."
      action={<Button onClick={() => setMintOpen(true)}>Create a key</Button>}
    >
      {isLoading ? (
        <PageLoadingSkeleton variant="table" rows={4} />
      ) : keys.isError ? (
        <ListErrorState
          title="Couldn't load your API keys."
          error={keys.error}
          onRetry={() => void keys.refetch()}
          isRetrying={keys.isRefetching}
        />
      ) : !data || data.length === 0 ? (
        <PageEmptyState
          title="No API keys yet"
          description="Create a scoped key for scripts, BI tools, or a private agent."
          action={<Button onClick={() => setMintOpen(true)}>Create a key</Button>}
        />
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((k) => (
                <TableRow key={k.id} className="cursor-pointer" onClick={() => open(k)}>
                  <TableCell className="font-medium text-foreground">{k.name}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {k.keyMasked}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{summariseScopes(k.scopes)}</TableCell>
                  <TableCell>{renderStatus(k)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.lastUsedAt ? formatDate(k.lastUsedAt) : '—'}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      primary={{ label: 'Open', ariaLabel: `Open the ${k.name} key`, onClick: () => open(k) }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {keys.items.length > 0 && (
        <ListFooter
          shown={keys.items.length}
          total={keys.total}
          hasMore={keys.hasMore}
          onLoadMore={keys.loadMore}
          isLoadingMore={keys.isLoadingMore}
          loadMoreFailed={keys.isLoadMoreError}
        />
      )}

      {selectedId && (
        <AgentDetailSheet
          open={detailOpen}
          onOpenChange={(v) => {
            setDetailOpen(v);
            if (!v) setSelectedId(null);
          }}
          kind="api_key"
          entityId={selectedId}
        />
      )}

      <ApiKeyMintSheet open={mintOpen} onOpenChange={setMintOpen} />
    </PageSection>
  );
}
