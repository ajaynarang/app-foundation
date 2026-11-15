'use client';

import { Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { AI_NEED_PAYER } from '@app/shared-types';
import type { AiCredentialSummary, AiNeedPayers } from '@app/shared-types';
import { CREDENTIAL_TYPE_META, NEED_LABELS } from '../constants';

export interface WhoPaysCardProps {
  payers: AiNeedPayers;
  credentials: AiCredentialSummary[];
}

/** Who pays for one need right now, in words: the platform, one of the workspace's own credentials, or nobody. */
export function payerText(payer: string, credentials: AiCredentialSummary[]): string {
  if (payer === AI_NEED_PAYER.PLATFORM) return 'Paid by the platform';
  if (payer === AI_NEED_PAYER.NONE) return 'Blocked: nothing can serve it right now';
  const credential = credentials.find((c) => c.publicId === payer);
  if (!credential) return 'Paid by your own credential';
  const which = credential.lastFour ? ` ending …${credential.lastFour}` : '';
  return `Paid by you, on your ${CREDENTIAL_TYPE_META[credential.type].label}${which}`;
}

/**
 * One line per need saying who pays right now (from `GET /ai-settings`), and the rule that spending caps cover only
 * what the platform pays for. A need can be paid differently from another: a workspace key that serves chat leaves
 * knowledge search on the platform.
 */
export function WhoPaysCard({ payers, credentials }: WhoPaysCardProps) {
  const needs = Object.keys(NEED_LABELS) as Array<keyof typeof NEED_LABELS>;
  return (
    <Card>
      <CardHeader className="space-y-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
          Who pays right now
        </CardTitle>
        <CardDescription>Spending caps apply only to usage the platform pays for</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 sm:grid-cols-[max-content_1fr] sm:gap-x-6">
          {needs.map((need) => (
            <div key={need} className="contents">
              <dt className="text-sm font-medium text-foreground">{NEED_LABELS[need]}</dt>
              <dd className="text-sm text-muted-foreground">{payerText(payers[need], credentials)}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
