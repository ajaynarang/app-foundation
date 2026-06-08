'use client';

import { useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { useTenantApiKeys } from '../hooks/use-tenant-api-keys';
import type { TenantApiKeyListItem } from '../api';
import { AgentDetailSheet } from '@/features/ai/agent-detail-sheet';
import { ApiKeyMintSheet } from './ApiKeyMintSheet';

function summariseScopes(scopes: readonly string[]): string {
  if (scopes.length === 0) return 'None';
  if (scopes.length <= 3) return scopes.join(', ');
  return `${scopes.slice(0, 3).join(', ')} +${scopes.length - 3} more`;
}

function renderStatus(key: TenantApiKeyListItem) {
  if (key.revokedAt) return <Badge variant="critical">Revoked</Badge>;
  if (!key.isActive) return <Badge variant="muted">Paused</Badge>;
  return <Badge variant="info">Active</Badge>;
}

export function ApiKeysPage() {
  const { data, isLoading } = useTenantApiKeys();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mintOpen, setMintOpen] = useState(false);

  const open = (key: TenantApiKeyListItem) => {
    setSelectedId(key.id);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">API keys</h2>
          <p className="text-sm text-muted-foreground">
            Scoped API keys for scripts, BI tools, and private agents that connect to your tenant.
          </p>
        </div>
        <Button onClick={() => setMintOpen(true)}>Create a key</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a scoped key for scripts, BI tools, or a private agent.
          </p>
          <Button className="mt-4" onClick={() => setMintOpen(true)}>
            Create a key
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((k) => (
                <TableRow key={k.id} className="cursor-pointer" onClick={() => open(k)}>
                  <TableCell className="font-medium text-foreground">{k.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{summariseScopes(k.scopes)}</TableCell>
                  <TableCell>{renderStatus(k)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        open(k);
                      }}
                    >
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
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
    </div>
  );
}
