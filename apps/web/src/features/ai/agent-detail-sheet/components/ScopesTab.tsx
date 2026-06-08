'use client';

import { useMemo, useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import type { AgentScope } from '@app/shared-types';
import { ScopeChip, ScopeMultiSelect, ScopeDiffPreview } from '@/features/ai/agent-scope-ui';
import { useUpdateApiKeyScopes } from '@/features/platform/api-keys';
import { useUpdateOAuthClientScopes } from '@/features/platform/oauth-clients/hooks/use-tenant-oauth-clients';

interface ScopesTabProps {
  kind: 'oauth_client' | 'api_key';
  /** API-key entities use a numeric DB id; OAuth-client entities use a string clientId. */
  entityId: string | number;
  currentScopes: AgentScope[];
  ipAllowlist?: string[];
  rateLimitPerMinute?: number;
  /**
   * When true, hide the Edit-scopes button and render chips only. Used for
   * revoked keys/clients where the backend refuses mutations anyway.
   */
  readOnly?: boolean;
}

/**
 * Inline scope editor — no separate modal.
 * Read mode: chips. Edit mode: ScopeMultiSelect + ScopeDiffPreview.
 * The "Confirm scope change" button triggers the mutation and
 * returns to read mode on success.
 */
export function ScopesTab({
  kind,
  entityId,
  currentScopes,
  ipAllowlist = [],
  rateLimitPerMinute,
  readOnly = false,
}: ScopesTabProps) {
  const [editing, setEditing] = useState(false);
  const [nextScopes, setNextScopes] = useState<AgentScope[]>(currentScopes);

  const updateApiKey = useUpdateApiKeyScopes();
  const updateOAuthClient = useUpdateOAuthClientScopes();

  const isDirty = useMemo(
    () => nextScopes.length !== currentScopes.length || nextScopes.some((s) => !currentScopes.includes(s)),
    [nextScopes, currentScopes],
  );

  const isPending = kind === 'api_key' ? updateApiKey.isPending : updateOAuthClient.isPending;

  const hasWriteScope = nextScopes.some((s) => s.includes(':write') || s === 'comms:send' || s === 'comms:send:bulk');
  const needsIpAllowlist = kind === 'api_key' && hasWriteScope && ipAllowlist.length === 0;

  const onStartEdit = () => {
    setNextScopes(currentScopes);
    setEditing(true);
  };

  const onCancel = () => {
    setNextScopes(currentScopes);
    setEditing(false);
  };

  const onConfirm = async () => {
    if (kind === 'api_key' && typeof entityId === 'number') {
      await updateApiKey.mutateAsync({
        id: entityId,
        scopes: nextScopes,
        ipAllowlist,
        rateLimitPerMinute,
      });
    } else if (kind === 'oauth_client' && typeof entityId === 'string') {
      await updateOAuthClient.mutateAsync({
        clientId: entityId,
        scopes: nextScopes,
      });
    }
    setEditing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Scopes</h3>
        {readOnly ? (
          <span className="text-xs text-muted-foreground">Read-only — revoked</span>
        ) : !editing ? (
          <Button size="sm" variant="outline" onClick={onStartEdit}>
            Edit scopes
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={onConfirm} loading={isPending} disabled={!isDirty || needsIpAllowlist}>
              Confirm scope change
            </Button>
          </div>
        )}
      </div>

      {!editing ? (
        currentScopes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scopes granted yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {currentScopes.map((s) => (
              <ScopeChip key={s} scope={s} />
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          <ScopeMultiSelect value={nextScopes} onChange={setNextScopes} disabled={isPending} />
          <ScopeDiffPreview current={currentScopes} next={nextScopes} />
          {needsIpAllowlist && (
            <p className="text-sm text-yellow-600 dark:text-yellow-400">
              Write-scope keys need an explicit IP policy. Add at least one CIDR from the Profile tab before confirming
              — use <code>0.0.0.0/0</code> if you need to accept any IP.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
