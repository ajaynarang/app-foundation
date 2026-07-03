'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { FormSheet } from '@app/ui/components/ui/form-sheet';
import { showSuccess, showError } from '@app/ui';
import type { AgentScope } from '@app/shared-types';
import { ScopeMultiSelect } from '@/features/ai/agent-scope-ui';
import { SecretCopyDialog } from '@/features/ai/agent-detail-sheet';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreateKeyResponse {
  id: string;
  key?: string;
  name: string;
  scopes: AgentScope[];
}

/**
 * Phase D API-key mint sheet. 4+ fields (name, scopes, IP allowlist,
 * rate limit) → uses FormSheet in edit mode. Inline validation for the
 * "write-scope requires IP allowlist" rule so the error appears before
 * the server round-trip.
 */
export function ApiKeyMintSheet({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<AgentScope[]>([]);
  const [ipAllowlistText, setIpAllowlistText] = useState('');
  const [rateLimit, setRateLimit] = useState('300');
  const [created, setCreated] = useState<CreateKeyResponse | null>(null);

  const mutation = useMutation({
    mutationFn: async (payload: {
      name: string;
      scopes: AgentScope[];
      ipAllowlist: string[];
      rateLimitPerMinute: number;
    }) =>
      apiClient<CreateKeyResponse>('/api-keys', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys.root });
      showSuccess('API key created — copy the secret before closing');
      setCreated(data);
    },
    onError: (err: Error) => {
      showError(extractErrorMessage(err) || "Couldn't create the key");
    },
  });

  const reset = () => {
    setName('');
    setScopes([]);
    setIpAllowlistText('');
    setRateLimit('300');
  };

  const ipAllowlist = ipAllowlistText
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  const hasWriteScope = scopes.some((s) => s.includes(':write') || s === 'comms:send' || s === 'comms:send:bulk');
  const needsIpAllowlist = hasWriteScope && ipAllowlist.length === 0;

  const canSubmit = name.trim().length > 0 && scopes.length > 0 && !needsIpAllowlist && !mutation.isPending;

  const handleSubmit = () => {
    mutation.mutate({
      name: name.trim(),
      scopes,
      ipAllowlist,
      rateLimitPerMinute: Number(rateLimit) || 300,
    });
  };

  const handleClose = () => {
    reset();
    setCreated(null);
    onOpenChange(false);
  };

  return (
    <>
      <FormSheet
        open={open && !created}
        onOpenChange={(v) => {
          if (!v) {
            reset();
            onOpenChange(false);
          } else {
            onOpenChange(v);
          }
        }}
        title="Create an API key"
        description="Scoped API key for a script, BI tool, or private agent."
        mode="edit"
        size="md"
        onSubmit={handleSubmit}
        submitLabel="Create key"
        submitDisabled={!canSubmit}
        isSubmitting={mutation.isPending}
        pinnable
        resizable
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. BI read-only script"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Scopes</Label>
            <ScopeMultiSelect value={scopes} onChange={setScopes} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="key-ip">IP allowlist (one CIDR per line)</Label>
              {hasWriteScope && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIpAllowlistText((prev) => (prev.trim() ? prev : '0.0.0.0/0'))}
                >
                  Allow any IP (0.0.0.0/0)
                </Button>
              )}
            </div>
            <textarea
              id="key-ip"
              className="w-full min-h-[80px] rounded-md border border-border bg-background p-2 text-sm font-mono"
              placeholder="10.0.0.0/24"
              value={ipAllowlistText}
              onChange={(e) => setIpAllowlistText(e.target.value)}
            />
            {hasWriteScope && (
              <p className="text-xs text-muted-foreground">
                Write-scope keys need an explicit IP policy. Paste specific CIDRs (e.g. <code>10.0.0.0/24</code>) for
                locked-down use, or click <strong>Allow any IP</strong> to accept connections from anywhere (laptops,
                serverless functions, etc.).
              </p>
            )}
            {needsIpAllowlist && (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Add at least one CIDR before creating the key.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="key-rate">Rate limit (per minute)</Label>
            <Input
              id="key-rate"
              type="number"
              min={1}
              max={6000}
              value={rateLimit}
              onChange={(e) => setRateLimit(e.target.value)}
            />
          </div>
        </div>
      </FormSheet>

      {created?.key && (
        <SecretCopyDialog
          open={!!created}
          onOpenChange={(v) => {
            if (!v) handleClose();
          }}
          title="Save the API key now"
          description="This is the only time you'll see the secret."
          secret={created.key}
        />
      )}
    </>
  );
}
