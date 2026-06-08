'use client';

import { useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@sally/ui/components/ui/sheet';
import { Copy, AlertCircle } from 'lucide-react';
import { useCreateOAuthClient } from '../use-oauth-clients';
import { OAUTH_SCOPES, OAUTH_SCOPE_DESCRIPTIONS } from '@sally/shared-types';
import type { OAuthClientCreatedResponse, OAuthScope } from '@sally/shared-types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateOAuthClientSheet({ open, onOpenChange }: Props) {
  const createMutation = useCreateOAuthClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [redirectUri, setRedirectUri] = useState('');
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [createdClient, setCreatedClient] = useState<OAuthClientCreatedResponse | null>(null);
  const [copied, setCopied] = useState<'id' | 'secret' | null>(null);

  function reset() {
    setName('');
    setDescription('');
    setRedirectUri('');
    setSelectedScopes([]);
    setCreatedClient(null);
    setCopied(null);
  }

  function handleClose(isOpen: boolean) {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  }

  async function handleSubmit() {
    const result = await createMutation.mutateAsync({
      name,
      description: description || undefined,
      redirectUris: redirectUri
        .split('\n')
        .map((u) => u.trim())
        .filter(Boolean),
      scopes: selectedScopes as OAuthScope[],
      clientType: 'confidential' as const,
    });
    setCreatedClient(result);
  }

  function handleCopy(value: string, type: 'id' | 'secret') {
    navigator.clipboard.writeText(value);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  function toggleScope(scope: string) {
    setSelectedScopes((prev) => (prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]));
  }

  const canSubmit = name.trim() && redirectUri.trim() && selectedScopes.length > 0;

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent
        className="w-full sm:max-w-lg overflow-y-auto"
        onInteractOutside={(e) => {
          if (!createdClient) e.preventDefault();
        }}
        pinnable
        resizable
        defaultPinned
      >
        {!createdClient ? (
          <>
            <SheetHeader>
              <SheetTitle>Register OAuth Client</SheetTitle>
              <SheetDescription>
                Create an app that users can sign in to and approve before it gets access to SALLY data.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Application Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Claude Desktop"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="What this application does"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="redirectUri">Redirect URIs (one per line)</Label>
                <Textarea
                  id="redirectUri"
                  placeholder="https://your-app.com/oauth/callback"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  rows={3}
                />
              </div>

              <div className="space-y-3">
                <Label>Scopes</Label>
                <div className="space-y-2">
                  {OAUTH_SCOPES.map((scope) => (
                    <label
                      key={scope}
                      className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <Checkbox
                        checked={selectedScopes.includes(scope)}
                        onCheckedChange={() => toggleScope(scope)}
                        className="mt-0.5"
                      />
                      <div>
                        <p className="text-sm font-medium">{scope}</p>
                        <p className="text-xs text-muted-foreground">{OAUTH_SCOPE_DESCRIPTIONS[scope]}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <SheetFooter className="mt-6 sticky bottom-0 bg-background pb-4 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} loading={createMutation.isPending}>
                Create Client
              </Button>
            </SheetFooter>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Client Created</SheetTitle>
              <SheetDescription>Save the client secret now. You will not be able to see it again.</SheetDescription>
            </SheetHeader>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label>Client ID</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {createdClient.clientId}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => handleCopy(createdClient.clientId, 'id')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {copied === 'id' && <p className="text-xs text-green-600 dark:text-green-400">Copied</p>}
              </div>

              <div className="space-y-2">
                <Label>Client Secret</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-3 py-2 text-sm font-mono break-all">
                    {createdClient.clientSecret}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => handleCopy(createdClient.clientSecret, 'secret')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {copied === 'secret' && <p className="text-xs text-green-600 dark:text-green-400">Copied</p>}
              </div>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Store these credentials securely. The client secret will only be shown once.
                </AlertDescription>
              </Alert>
            </div>

            <SheetFooter className="mt-6">
              <Button onClick={() => handleClose(false)}>Done</Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
