'use client';

import { useState } from 'react';
import { KeyRound, RotateCw, ShieldCheck, Trash2 } from 'lucide-react';
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
import { StatusBadge, cn, variantOf } from '@app/ui';
import { Card, CardContent, CardHeader } from '@app/ui/components/ui/card';
import { AiCredentialStatus, AiCredentialType } from '@app/shared-types';
import type { AiCredentialSummary } from '@app/shared-types';
import { RelativeTime, RowActions, type RowActionItem } from '@/shared/components/page-chrome';
import { AI_CREDENTIAL_STATUS_VARIANTS, CREDENTIAL_TYPE_META } from '../constants';
import { useRemoveCredential, useValidateCredential } from '../hooks/use-ai-settings';

export interface CredentialCardProps {
  credential: AiCredentialSummary;
  isOwner: boolean;
  /** False when the deployment has bring-your-own-key off: a stored key can be removed, not tested. */
  canTest: boolean;
}

/**
 * One workspace credential: its type, status, the last four characters (or "No secret stored" for an AWS role), when
 * it was last tested and why it last failed. A credential the retention policy rules out is dimmed and says so. The
 * owner gets Test again and Remove; everyone else reads.
 */
export function CredentialCard({ credential, isOwner, canTest }: CredentialCardProps) {
  const validate = useValidateCredential();
  const remove = useRemoveCredential();
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false);

  const meta = CREDENTIAL_TYPE_META[credential.type];
  const status = variantOf(AI_CREDENTIAL_STATUS_VARIANTS, credential.status);
  const isBedrock = credential.type === AiCredentialType.BEDROCK_ROLE;
  const isFailing = credential.status === AiCredentialStatus.FAILING;

  const actions: RowActionItem[] = [
    ...(canTest
      ? [
          {
            label: 'Test again',
            icon: RotateCw,
            disabled: validate.isPending,
            disabledReason: 'Testing…',
            onSelect: () => validate.mutate(credential.publicId),
          },
        ]
      : []),
    {
      label: 'Remove…',
      icon: Trash2,
      destructive: true,
      ariaLabel: `Remove the ${meta.label}`,
      onSelect: () => setIsConfirmingRemove(true),
    },
  ];

  return (
    <Card className={cn(credential.inertUnderPolicy && 'opacity-60')}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium text-foreground">{meta.label}</span>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {isOwner && <RowActions menuLabel={`Actions for the ${meta.label}`} reveal="always" items={actions} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isBedrock ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="break-all font-mono text-xs text-muted-foreground">{credential.roleArn}</p>
            <StatusBadge tone="neutral">No secret stored</StatusBadge>
          </div>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">Key ending …{credential.lastFour}</p>
        )}
        {isBedrock && credential.awsRegion && (
          <p className="text-xs text-muted-foreground">Region: {credential.awsRegion}</p>
        )}
        {credential.zdrAttested && (
          <p className="flex items-center gap-1 text-xs text-info-text">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            <RelativeTime iso={credential.zdrAttestedAt} prefix="Zero-retention agreement attested" />
          </p>
        )}
        {credential.inertUnderPolicy && (
          <p className="text-xs text-muted-foreground">
            Inert under the current retention policy. It is used again if the policy changes back
          </p>
        )}
        {credential.lastError && (
          <p
            className={cn(
              'rounded-md p-2 text-xs',
              isFailing ? 'bg-critical/10 text-critical-text' : 'bg-caution/15 text-caution-text',
            )}
          >
            {credential.lastError}
          </p>
        )}
        {credential.lastValidatedAt && (
          <p className="text-xs text-muted-foreground">
            <RelativeTime iso={credential.lastValidatedAt} prefix="Last tested" />
          </p>
        )}
      </CardContent>

      <AlertDialog open={isConfirmingRemove} onOpenChange={setIsConfirmingRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this credential?</AlertDialogTitle>
            <AlertDialogDescription>
              Calls it served move to the remaining credentials, or to the platform default when none apply. This cannot
              be undone; you can connect it again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setIsConfirmingRemove(false);
                remove.mutate(credential.publicId);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
