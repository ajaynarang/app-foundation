'use client';

import { useState } from 'react';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
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
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { useOAuthClients, useRevokeOAuthClient } from '../use-oauth-clients';
import { CreateOAuthClientSheet } from './create-oauth-client-sheet';
import { formatDistanceToNow } from 'date-fns';

export function OAuthClientsList() {
  const { data: clients, isLoading } = useOAuthClients();
  const revokeMutation = useRevokeOAuthClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeConfirm, setRevokeConfirm] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="mt-2 h-4 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Register Client
        </Button>
      </div>

      {!clients?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <KeyRound className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No OAuth clients</h3>
            <p className="mb-4 text-muted-foreground">
              Register your first app so users can sign in and approve access to platform data.
            </p>
            <Button onClick={() => setCreateOpen(true)}>Register First Client</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {clients.map((client) => (
            <Card key={client.clientId}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{client.name}</CardTitle>
                    <CardDescription className="mt-1">
                      <code className="text-xs">{client.clientId}</code>
                      {' · '}
                      Created{' '}
                      {formatDistanceToNow(new Date(client.createdAt), {
                        addSuffix: true,
                      })}
                    </CardDescription>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setRevokeConfirm(client.clientId)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {client.description && <p className="mb-3 text-sm text-muted-foreground">{client.description}</p>}
                <div className="flex flex-wrap gap-1">
                  {client.scopes.map((scope) => (
                    <Badge key={scope} variant="outline" className="text-xs">
                      {scope}
                    </Badge>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant={client.isActive ? 'default' : 'destructive'}>
                    {client.isActive ? 'Active' : 'Revoked'}
                  </Badge>
                  <Badge variant="outline">{client.clientType}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateOAuthClientSheet open={createOpen} onOpenChange={setCreateOpen} />

      <AlertDialog open={!!revokeConfirm} onOpenChange={(open) => !open && setRevokeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke OAuth Client</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke all access tokens for this client. External applications using this client
              will lose access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (revokeConfirm) {
                  revokeMutation.mutate(revokeConfirm);
                  setRevokeConfirm(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
