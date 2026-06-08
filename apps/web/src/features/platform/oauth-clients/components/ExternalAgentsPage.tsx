'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import type { OAuthClientResponse } from '@app/shared-types';
import { STORAGE_KEYS } from '@/shared/constants/storage-keys';
import { useTenantOAuthClients } from '../hooks/use-tenant-oauth-clients';
import { AgentDetailSheet } from '@/features/ai/agent-detail-sheet';
import { OAuthClientRegisterSheet } from './OAuthClientRegisterSheet';
import { ExternalAgentsQuickstartModal } from './ExternalAgentsQuickstartModal';

function summariseScopes(scopes: readonly string[]): string {
  if (scopes.length === 0) return 'None';
  if (scopes.length <= 3) return scopes.join(', ');
  return `${scopes.slice(0, 3).join(', ')} +${scopes.length - 3} more`;
}

export function ExternalAgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading } = useTenantOAuthClients();
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);

  // Auto-open the quickstart modal when the page is reached via
  // `?quickstart=true` (e.g. from the console MCP deep-link) UNLESS the user
  // previously checked "Don't show again".
  useEffect(() => {
    if (searchParams.get('quickstart') !== 'true') return;
    if (typeof window !== 'undefined') {
      try {
        if (window.localStorage.getItem(STORAGE_KEYS.DESK_QUICKSTART_DISMISSED) === 'true') {
          // Respect the dismissal — just strip the query param and move on.
          const params = new URLSearchParams(window.location.search);
          params.delete('quickstart');
          const qs = params.toString();
          router.replace(qs ? `?${qs}` : '?', { scroll: false });
          return;
        }
      } catch {
        // localStorage disabled — fall through and open the modal.
      }
    }
    setQuickstartOpen(true);
    // Strip the param immediately so a reload doesn't re-trigger the modal.
    const params = new URLSearchParams(window.location.search);
    params.delete('quickstart');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
    // Intentionally only run on first render — we read the URL once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDetail = (client: OAuthClientResponse) => {
    setSelectedId(client.clientId);
    setDetailOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">External agents</h2>
          <p className="text-sm text-muted-foreground">
            ChatGPT, Claude, and other third-party AI clients connected to your tenant.
          </p>
        </div>
        <Button onClick={() => setRegisterOpen(true)}>Register an agent</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <p className="text-sm text-muted-foreground">No external agents yet.</p>
          <p className="mt-1 text-xs text-muted-foreground">Connect ChatGPT, Claude, or your own agent to start.</p>
          <Button className="mt-4" onClick={() => setRegisterOpen(true)}>
            Register an agent
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
                <TableHead>Created</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.clientId} className="cursor-pointer" onClick={() => openDetail(c)}>
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{summariseScopes(c.scopes)}</TableCell>
                  <TableCell>
                    <Badge variant={c.isActive ? 'info' : 'muted'}>{c.isActive ? 'Active' : 'Paused'}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(c.createdAt).toLocaleString(undefined, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDetail(c);
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
          kind="oauth_client"
          entityId={selectedId}
        />
      )}

      <OAuthClientRegisterSheet open={registerOpen} onOpenChange={setRegisterOpen} />

      <ExternalAgentsQuickstartModal
        open={quickstartOpen}
        onOpenChange={setQuickstartOpen}
        onRegisterClick={() => setRegisterOpen(true)}
      />
    </div>
  );
}
