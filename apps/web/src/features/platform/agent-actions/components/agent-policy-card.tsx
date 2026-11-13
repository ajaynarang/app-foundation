'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
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
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Label } from '@app/ui/components/ui/label';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Switch } from '@app/ui/components/ui/switch';
import { ListErrorState } from '@/shared/components/page-chrome';
import { useAgentPolicy, useUpdateAgentPolicy } from '../hooks/use-agent-policy';

export interface AgentPolicyCardProps {
  /** The owner changes it; an admin reads it. */
  isOwner: boolean;
}

/**
 * One switch: whether external agents (connected apps and API keys) wait for a person to approve each standard write
 * (the default), or confirm their own. Relaxing it is confirmed first. A sensitive write needs the PIN either way.
 */
export function AgentPolicyCard({ isOwner }: AgentPolicyCardProps) {
  const policy = useAgentPolicy(true);
  const update = useUpdateAgentPolicy();
  const [confirmingRelax, setConfirmingRelax] = useState(false);
  const selfConfirm = policy.data?.selfConfirm ?? false;

  const handleChange = (next: boolean) => {
    if (next) setConfirmingRelax(true);
    else update.mutate({ selfConfirm: false });
  };

  return (
    <Card>
      <CardContent className="pt-6">
        {policy.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : policy.isError ? (
          <ListErrorState
            title="Couldn't load how agent writes are approved"
            error={policy.error}
            onRetry={() => void policy.refetch()}
            isRetrying={policy.isFetching}
          />
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="agent-self-confirm" className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
                Let agents confirm their own changes
              </Label>
              <p className="text-xs text-muted-foreground">
                {selfConfirm
                  ? 'Connected apps and API keys make standard changes without asking anyone. Sensitive changes still need the PIN of the person they act for.'
                  : 'Off: a person approves each change a connected app or API key wants to make, from a link the agent shares. Sensitive changes always need a PIN.'}
              </p>
              {!isOwner ? (
                <p className="text-xs text-muted-foreground">Only the workspace owner can change this.</p>
              ) : null}
            </div>
            <Switch
              id="agent-self-confirm"
              checked={selfConfirm}
              onCheckedChange={handleChange}
              disabled={!isOwner || update.isPending}
              aria-label="Let agents confirm their own changes"
            />
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmingRelax} onOpenChange={setConfirmingRelax}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Let agents confirm their own changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Connected apps and API keys will make standard changes in this workspace without a person approving each
              one. Sensitive changes still need the PIN of the person they act for. You can turn this off at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep approvals</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmingRelax(false);
                update.mutate({ selfConfirm: true });
              }}
            >
              Let agents confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
