'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@app/ui/components/ui/button';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import type { OAuthClientResponse } from '@app/shared-types';
import { STORAGE_KEYS } from '@appshore/web-core/shared/constants/storage-keys';
import { useTenantOAuthClients } from '../hooks/use-tenant-oauth-clients';
import { AgentDetailSheet } from '@/features/ai/agent-detail-sheet';
import { credentialStatus } from '@/features/ai/agent-scope-ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { OAuthClientRegisterSheet } from './OAuthClientRegisterSheet';
import { ExternalAgentsQuickstartModal } from './ExternalAgentsQuickstartModal';
import {
  ListErrorState,
  ListFooter,
  PageEmptyState,
  PageLoadingSkeleton,
  PageSection,
  RowActions,
} from '@/shared/components/page-chrome';

function summariseScopes(scopes: readonly string[]): string {
  if (scopes.length === 0) return 'None';
  if (scopes.length <= 3) return scopes.join(', ');
  return `${scopes.slice(0, 3).join(', ')} +${scopes.length - 3} more`;
}

export function ExternalAgentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clients = useTenantOAuthClients();
  const { formatDateTime } = useFormatters();
  const { data, isLoading } = clients;
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [quickstartOpen, setQuickstartOpen] = useState(false);

  // Auto-open the quickstart modal when the page is reached via
  // `?quickstart=true` (a deep link to the quickstart) UNLESS the user
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
    <PageSection
      title="External agents"
      description="ChatGPT, Claude, and other third-party AI clients connected to your tenant."
      action={<Button onClick={() => setRegisterOpen(true)}>Register an agent</Button>}
    >
      {isLoading ? (
        <PageLoadingSkeleton variant="table" rows={4} />
      ) : clients.isError ? (
        <ListErrorState
          title="Couldn't load your external agents."
          error={clients.error}
          onRetry={() => void clients.refetch()}
          isRetrying={clients.isRefetching}
        />
      ) : !data || data.length === 0 ? (
        <PageEmptyState
          title="No external agents yet"
          description="Connect ChatGPT, Claude, or your own agent to start."
          action={<Button onClick={() => setRegisterOpen(true)}>Register an agent</Button>}
        />
      ) : (
        <div className="rounded-md border border-border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((c) => (
                <TableRow key={c.clientId} className="cursor-pointer" onClick={() => openDetail(c)}>
                  <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{summariseScopes(c.scopes)}</TableCell>
                  <TableCell>
                    <StatusBadge tone={credentialStatus(c).tone}>{credentialStatus(c).label}</StatusBadge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDateTime(c.createdAt)}
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <RowActions
                      primary={{ label: 'Open', ariaLabel: `Open ${c.name}`, onClick: () => openDetail(c) }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {clients.items.length > 0 && (
        <ListFooter
          shown={clients.items.length}
          total={clients.total}
          hasMore={clients.hasMore}
          onLoadMore={clients.loadMore}
          isLoadingMore={clients.isLoadingMore}
          loadMoreFailed={clients.isLoadMoreError}
        />
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
    </PageSection>
  );
}
