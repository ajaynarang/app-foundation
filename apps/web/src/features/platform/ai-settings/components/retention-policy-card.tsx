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
import { StatusBadge } from '@app/ui';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import type { AiRetentionPolicy } from '@app/shared-types';
import { RETENTION_POLICY } from '../constants';
import { useUpdateAiPolicy } from '../hooks/use-ai-settings';

export interface RetentionPolicyCardProps {
  policy: AiRetentionPolicy;
  isOwner: boolean;
  ownerOnlyText: string;
}

/**
 * Standard or zero data retention. Only the owner flips it, and requiring zero retention is confirmed first: routing
 * changes at once, keys that cannot comply go inert, and calls with no compliant route are blocked, not downgraded.
 */
export function RetentionPolicyCard({ policy, isOwner, ownerOnlyText }: RetentionPolicyCardProps) {
  const updatePolicy = useUpdateAiPolicy();
  const [isConfirmingZdr, setIsConfirmingZdr] = useState(false);
  const isZdr = policy === RETENTION_POLICY.ZDR;

  const handleFlip = () => {
    if (isZdr) updatePolicy.mutate({ policy: RETENTION_POLICY.STANDARD });
    else setIsConfirmingZdr(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden />
            Retention policy
          </CardTitle>
          <CardDescription>What AI providers may keep, enforced on every call</CardDescription>
        </div>
        <StatusBadge tone={isZdr ? 'info' : 'neutral'}>{isZdr ? 'Zero data retention' : 'Standard'}</StatusBadge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {isZdr
            ? 'Only zero-retention routes are used. A call with no compliant route is blocked, never downgraded.'
            : 'Any connected route may serve. Require zero data retention to allow compliant routes only.'}
        </p>
        {isOwner ? (
          <Button variant="outline" onClick={handleFlip} loading={updatePolicy.isPending} className="shrink-0">
            {isZdr ? 'Switch to Standard' : 'Require zero retention'}
          </Button>
        ) : (
          <p className="shrink-0 text-xs text-muted-foreground">{ownerOnlyText}</p>
        )}
      </CardContent>

      <AlertDialog open={isConfirmingZdr} onOpenChange={setIsConfirmingZdr}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Require zero data retention?</AlertDialogTitle>
            <AlertDialogDescription>
              Routing changes at once. Credentials that cannot keep zero retention become inert: they are kept, shown
              dimmed, and come back if you switch back. AI calls with no compliant route are blocked, not downgraded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setIsConfirmingZdr(false);
                updatePolicy.mutate({ policy: RETENTION_POLICY.ZDR });
              }}
            >
              Require zero retention
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
