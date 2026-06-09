'use client';

import { useState, useMemo } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
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
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Alert, AlertDescription } from '@app/ui/components/ui/alert';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { AlertCircle, Key, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { CopyButton } from '@app/ui/components/ui/copy-button';
import { UrlRow } from '@app/ui/components/ui/url-row';
import { useApiKeys, useCreateApiKey, useRevokeApiKey, type ApiKey } from '@/features/api-keys/use-api-keys';
import { ConsoleFeatureGuard } from '@/components/feature-guard';
import { getApiBaseUrl, getEnvironmentLabel } from '@/shared/lib/access-environments';

export default function ApiKeysPage() {
  const { data: keys, isLoading } = useApiKeys();
  const createMutation = useCreateApiKey();
  const revokeMutation = useRevokeApiKey();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<ApiKey | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
  const environmentLabel = useMemo(() => getEnvironmentLabel(apiBaseUrl), [apiBaseUrl]);

  async function handleCreateKey() {
    if (!newKeyName.trim()) return;
    const result = await createMutation.mutateAsync({ name: newKeyName });
    setCreatedKey(result);
    setNewKeyName('');
  }

  function handleRevokeKey(id: string) {
    setRevokeConfirm(null);
    revokeMutation.mutate(id);
  }

  function closeCreateDialog() {
    setIsCreateDialogOpen(false);
    setCreatedKey(null);
    setNewKeyName('');
  }

  return (
    <ConsoleFeatureGuard entitlementKey="api_keys">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">API Keys</h1>
          <p className="text-muted-foreground mt-1">Create keys for server-to-server access to the platform APIs.</p>
        </div>

        {/* Current environment */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">Environment</p>
              <Badge variant="outline">{environmentLabel}</Badge>
            </div>
            <UrlRow label="API Base URL" value={apiBaseUrl} />
            <p className="text-xs text-muted-foreground">Keys created here are scoped to this environment only.</p>
          </CardContent>
        </Card>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Need users to sign in before accessing data? Use OAuth instead of API keys.</span>
            <a
              href="/developer/oauth-clients"
              className="text-sm font-medium text-foreground underline underline-offset-4"
            >
              Go to OAuth Clients
            </a>
          </AlertDescription>
        </Alert>

        {/* Create button + dialog */}
        <div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Key className="mr-2 h-4 w-4" />
            Create API Key
          </Button>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogContent className="max-h-[85vh] overflow-y-auto">
              {!createdKey ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Create API Key</DialogTitle>
                    <DialogDescription>
                      This key will have full access to your {environmentLabel.toLowerCase()} tenant data.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="name">Key Name</Label>
                      <Input
                        id="name"
                        placeholder="e.g., ETL Pipeline, CI Integration"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateKey} disabled={!newKeyName.trim()} loading={createMutation.isPending}>
                      Create
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Key Created</DialogTitle>
                    <DialogDescription>Copy this key now — it will not be shown again.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono overflow-x-auto">
                        {createdKey.key}
                      </code>
                      <CopyButton value={createdKey.key ?? ''} label="API key" />
                    </div>
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Store this key in a secure location. You will not be able to view it again.
                      </AlertDescription>
                    </Alert>
                  </div>
                  <DialogFooter>
                    <Button onClick={closeCreateDialog}>Done</Button>
                  </DialogFooter>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Key list */}
        <div className="space-y-4">
          {isLoading ? (
            <>
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-32 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                  </CardContent>
                </Card>
              ))}
            </>
          ) : !keys?.length ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Key className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">No API keys yet</h3>
                <p className="text-muted-foreground mb-4">Create a key to start making authenticated API requests.</p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>Create API Key</Button>
              </CardContent>
            </Card>
          ) : (
            keys.map((key) => (
              <Card key={key.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{key.name}</CardTitle>
                      <CardDescription className="mt-1">
                        Created{' '}
                        {formatDistanceToNow(new Date(key.createdAt), {
                          addSuffix: true,
                        })}
                      </CardDescription>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setRevokeConfirm(key.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Requests</span>
                      <span className="font-medium">{key.requestCount.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Last used</span>
                      <span className="font-medium">
                        {key.lastUsedAt ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true }) : 'Never'}
                      </span>
                    </div>
                    <div className="pt-2 flex items-center gap-2">
                      <Badge variant={key.isActive ? 'default' : 'muted'}>{key.isActive ? 'Active' : 'Revoked'}</Badge>
                      <Badge variant="outline">{environmentLabel}</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Revoke confirmation */}
        <AlertDialog open={!!revokeConfirm} onOpenChange={(open) => !open && setRevokeConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
              <AlertDialogDescription>
                This will immediately stop all requests using this key. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => revokeConfirm && handleRevokeKey(revokeConfirm)}
                className="bg-red-600 hover:bg-red-700"
              >
                Revoke
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ConsoleFeatureGuard>
  );
}
