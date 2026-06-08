'use client';

import { useMemo, useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@app/ui/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import { MoreHorizontal, Pause, Play, RefreshCw, Ban } from 'lucide-react';
import { useTenantApiKeys } from '@/features/platform/api-keys';
import { useRotateApiKey, usePauseApiKey, useResumeApiKey, useRevokeApiKeyAdmin } from '@/features/platform/api-keys';
import {
  useOAuthClientDetail,
  useRotateOAuthClientSecret,
  usePauseOAuthClient,
  useResumeOAuthClient,
  useRevokeOAuthClientAdmin,
} from '@/features/platform/oauth-clients/hooks/use-tenant-oauth-clients';
import { SecretCopyDialog } from './SecretCopyDialog';

interface Props {
  kind: 'oauth_client' | 'api_key';
  /** API-key entities use a numeric DB id; OAuth-client entities use a string clientId. */
  entityId: string | number;
}

/**
 * Sticky footer action bar for the External-agent / API-key detail sheet.
 * Matches the Driver/Load detail-sheet pattern: an overflow DropdownMenu of
 * non-destructive ops on the left, a primary destructive action (Revoke) on
 * the right. Renders nothing for already-revoked entities.
 */
export function AgentDetailFooterActions({ kind, entityId }: Props) {
  if (kind === 'api_key' && typeof entityId === 'number') {
    return <ApiKeyFooterActions apiKeyId={entityId} />;
  }
  if (kind === 'oauth_client' && typeof entityId === 'string') {
    return <OAuthClientFooterActions clientId={entityId} />;
  }
  return null;
}

function ApiKeyFooterActions({ apiKeyId }: { apiKeyId: number }) {
  const { data: keys } = useTenantApiKeys();
  const apiKey = useMemo(() => keys?.find((k) => k.id === apiKeyId) ?? null, [keys, apiKeyId]);
  const rotate = useRotateApiKey();
  const pause = usePauseApiKey();
  const resume = useResumeApiKey();
  const revoke = useRevokeApiKeyAdmin();
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);

  if (!apiKey || apiKey.revokedAt) return null;

  const handleRotate = async () => {
    const result = await rotate.mutateAsync(apiKeyId);
    setRotatedSecret(result.plaintextKey);
  };

  return (
    <ActionBar
      isActive={apiKey.isActive}
      onPause={() => pause.mutate(apiKeyId)}
      onResume={() => resume.mutate(apiKeyId)}
      onRotate={handleRotate}
      onRevoke={() => setShowRevoke(true)}
      pausing={pause.isPending}
      resuming={resume.isPending}
      rotating={rotate.isPending}
      rotatedSecret={rotatedSecret}
      onCloseSecret={() => setRotatedSecret(null)}
      secretTitle="Copy the new API key now"
      revokeOpen={showRevoke}
      onRevokeOpenChange={setShowRevoke}
      revokeTitle="Revoke this API key?"
      revokeDescription="All future calls using this key will fail. This cannot be undone."
      onRevokeConfirm={() => revoke.mutate(apiKeyId)}
    />
  );
}

function OAuthClientFooterActions({ clientId }: { clientId: string }) {
  const { data } = useOAuthClientDetail(clientId);
  const rotate = useRotateOAuthClientSecret();
  const pause = usePauseOAuthClient();
  const resume = useResumeOAuthClient();
  const revoke = useRevokeOAuthClientAdmin();
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [showRevoke, setShowRevoke] = useState(false);

  if (!data) return null;

  const handleRotate = async () => {
    const result = await rotate.mutateAsync(clientId);
    setRotatedSecret(result.clientSecret);
  };

  return (
    <ActionBar
      isActive={data.isActive}
      onPause={() => pause.mutate(clientId)}
      onResume={() => resume.mutate(clientId)}
      onRotate={handleRotate}
      onRevoke={() => setShowRevoke(true)}
      pausing={pause.isPending}
      resuming={resume.isPending}
      rotating={rotate.isPending}
      rotatedSecret={rotatedSecret}
      onCloseSecret={() => setRotatedSecret(null)}
      secretTitle="Copy the new client secret now"
      revokeOpen={showRevoke}
      onRevokeOpenChange={setShowRevoke}
      revokeTitle="Revoke this OAuth client?"
      revokeDescription="This will cascade-revoke every active access and refresh token for this client. The app will have to re-authorize from scratch."
      onRevokeConfirm={() => revoke.mutate(clientId)}
    />
  );
}

interface ActionBarProps {
  isActive: boolean;
  onPause: () => void;
  onResume: () => void;
  onRotate: () => void;
  onRevoke: () => void;
  pausing: boolean;
  resuming: boolean;
  rotating: boolean;
  rotatedSecret: string | null;
  onCloseSecret: () => void;
  secretTitle: string;
  revokeOpen: boolean;
  onRevokeOpenChange: (open: boolean) => void;
  revokeTitle: string;
  revokeDescription: string;
  onRevokeConfirm: () => void;
}

function ActionBar(p: ActionBarProps) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm">
            <MoreHorizontal className="h-4 w-4" />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {p.isActive ? (
            <DropdownMenuItem onClick={p.onPause} disabled={p.pausing}>
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={p.onResume} disabled={p.resuming}>
              <Play className="h-4 w-4 mr-2" />
              Resume
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={p.onRotate} disabled={p.rotating}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Rotate secret
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex-1" />
      <Button size="sm" variant="destructive" onClick={p.onRevoke}>
        <Ban className="h-4 w-4 mr-1" />
        Revoke
      </Button>

      {p.rotatedSecret && (
        <SecretCopyDialog
          open={!!p.rotatedSecret}
          onOpenChange={(v) => {
            if (!v) p.onCloseSecret();
          }}
          title={p.secretTitle}
          description="This is the only time you’ll see this value. Save it before closing."
          secret={p.rotatedSecret}
        />
      )}

      <AlertDialog open={p.revokeOpen} onOpenChange={p.onRevokeOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{p.revokeTitle}</AlertDialogTitle>
            <AlertDialogDescription>{p.revokeDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={p.onRevokeConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
