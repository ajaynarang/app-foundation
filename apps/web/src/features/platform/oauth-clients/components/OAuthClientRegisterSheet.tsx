'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Textarea } from '@app/ui/components/ui/textarea';
import { FormSheet } from '@app/ui/components/ui/form-sheet';
import type { AgentScope } from '@app/shared-types';
import { ScopeMultiSelect } from '@/features/ai/agent-scope-ui';
import { useCreateOAuthClient } from '../hooks/use-oauth-clients';
import { SecretCopyDialog } from '@/features/ai/agent-detail-sheet';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Register sheet for OAuth clients under Settings → OAuth Clients.
 * Collects name, description, redirectUris, scopes. On success,
 * reveals the client secret once via the SecretCopyDialog and
 * clears local state.
 */
export function OAuthClientRegisterSheet({ open, onOpenChange }: Props) {
  const create = useCreateOAuthClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [redirectUris, setRedirectUris] = useState('');
  const [scopes, setScopes] = useState<AgentScope[]>([]);
  const [revealed, setRevealed] = useState<{
    clientId: string;
    clientSecret: string;
  } | null>(null);

  const reset = () => {
    setName('');
    setDescription('');
    setRedirectUris('');
    setScopes([]);
  };

  const canSubmit = name.trim().length > 0 && redirectUris.trim().length > 0 && scopes.length > 0;

  const handleSubmit = async () => {
    const created = await create.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      redirectUris: redirectUris
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      // OAuth schema legacy scope enum predates the AgentScope union.
      // Scopes are validated server-side against NEVER_EXTERNAL_SCOPES
      // and the full AgentScope set — casting is safe at the boundary.
      scopes: scopes as unknown as never,
      clientType: 'confidential',
    });
    setRevealed({
      clientId: created.clientId,
      clientSecret: created.clientSecret,
    });
  };

  const handleClose = () => {
    reset();
    setRevealed(null);
    onOpenChange(false);
  };

  return (
    <>
      <FormSheet
        open={open && !revealed}
        onOpenChange={(v) => {
          if (!v) {
            reset();
            onOpenChange(false);
          } else {
            onOpenChange(v);
          }
        }}
        title="Register an external agent"
        description="Create an OAuth client that ChatGPT, Claude, or a custom app can use to connect to your tenant."
        mode="edit"
        size="md"
        onSubmit={handleSubmit}
        isSubmitting={create.isPending}
        submitLabel="Create client"
        submitDisabled={!canSubmit}
        pinnable
        resizable
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Application name</Label>
            <Input
              id="agent-name"
              placeholder="e.g. Claude Desktop"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-description">Description (optional)</Label>
            <Textarea
              id="agent-description"
              placeholder="What this app does with your tenant"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-redirect">Redirect URIs (one per line)</Label>
            <Textarea
              id="agent-redirect"
              placeholder="https://your-app.com/oauth/callback"
              value={redirectUris}
              onChange={(e) => setRedirectUris(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Scopes</Label>
            <ScopeMultiSelect value={scopes} onChange={setScopes} />
          </div>
        </div>
      </FormSheet>

      {revealed && (
        <SecretCopyDialog
          open={!!revealed}
          onOpenChange={(v) => {
            if (!v) handleClose();
          }}
          title="Save the client secret now"
          description={`Client ID: ${revealed.clientId}. This secret will not be shown again.`}
          secret={revealed.clientSecret}
        />
      )}
    </>
  );
}
