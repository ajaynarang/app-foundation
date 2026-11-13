'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bot, KeyRound, ShieldCheck, ShieldOff } from 'lucide-react';
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
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@app/ui/components/ui/card';
import { Label } from '@app/ui/components/ui/label';
import { Separator } from '@app/ui/components/ui/separator';
import { StatusBadge } from '@app/ui';
import { AgentActionStatusSchema, type AgentAction } from '@app/shared-types';
import { extractFieldErrors } from '@appshore/web-core/shared/lib/error-utils';
import { PinInput } from '@/components/ui/pin-input';
import {
  ListErrorState,
  PageEmptyState,
  PageHeader,
  PageLoadingSkeleton,
  PageToolbar,
  RelativeTime,
} from '@/shared/components/page-chrome';
import { AGENT_ACTION_CLOSED_COPY, AGENT_ACTION_STATUS_VARIANTS, PROFILE_PIN_PATH } from '../constants';
import { useAgentAction, useDecideAgentAction, useStepUpAgentAction } from '../hooks/use-agent-action';
import { isFinalError } from '../lib/is-final-error';

const PENDING = AgentActionStatusSchema.enum.PENDING;

/**
 * The page an external agent's approval link opens. It shows exactly what the agent will run and for whom.
 *
 * - A standard write: the person the agent acts for, or a workspace owner or admin, approves or denies it.
 * - A sensitive write: the person the agent acts for confirms with their PIN (with no PIN set, a link to set one
 *   that brings them back here). An owner or admin can deny it, never approve it.
 *
 * Deny asks first, because a denied request is final.
 */
export function AgentActionReview({ token }: { token: string }) {
  const query = useAgentAction(token);
  const { approve, deny } = useDecideAgentAction(token);
  const [denyOpen, setDenyOpen] = useState(false);
  const action = query.data;
  const deciding = approve.isPending || deny.isPending;
  // Past its window the server refuses it: do not offer a click that can only fail.
  const open = !!action && action.status === PENDING && action.canDecide && Date.parse(action.expiresAt) > Date.now();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Agent request"
        subtitle="An agent wants to act for you. You decide"
        actions={
          open ? (
            <PageToolbar
              secondaryActions={
                <Button variant="outline" onClick={() => setDenyOpen(true)} disabled={deciding}>
                  Deny
                </Button>
              }
              primaryAction={
                action.approvalRequired ? (
                  <Button
                    className="gap-1.5"
                    onClick={() => approve.mutate()}
                    loading={approve.isPending}
                    disabled={deciding}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Approve
                  </Button>
                ) : undefined
              }
            />
          ) : undefined
        }
      />

      <div className="mt-6">
        {query.isLoading ? (
          <PageLoadingSkeleton variant="form" rows={5} />
        ) : query.isError && isFinalError(query.error) ? (
          <PageEmptyState
            icon={ShieldOff}
            title="This request is not yours to see"
            description="It does not exist in this workspace, or only the person the agent acts for (or a workspace owner or admin) can open it. Check you are in the right workspace, or forward them the link."
          />
        ) : query.isError || !action ? (
          <ListErrorState
            title="Couldn't load this request"
            error={query.error}
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
          />
        ) : (
          <RequestCard action={action} token={token} />
        )}
      </div>

      <AlertDialog open={denyOpen} onOpenChange={setDenyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny this request?</AlertDialogTitle>
            <AlertDialogDescription>
              {action?.caller.label ?? 'The agent'} will not be able to run it. If it was wanted after all, the agent
              can ask again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                deny.mutate();
                setDenyOpen(false);
              }}
            >
              Deny
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RequestCard({ action, token }: { action: AgentAction; token: string }) {
  const variant = AGENT_ACTION_STATUS_VARIANTS[action.status];
  const CallerIcon = action.caller.kind === 'api_key' ? KeyRound : Bot;
  const args = Object.entries(action.args);
  const pendingPin = action.status === PENDING && action.stepUpRequired && Date.parse(action.expiresAt) > Date.now();

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/50">
              <CallerIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
            </span>
            <div className="min-w-0">
              <CardTitle className="text-base leading-snug">
                {action.caller.label} wants to run {action.tool}
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {action.caller.kind === 'api_key' ? 'API key' : 'Connected app'}
                {action.onBehalfOf ? ` · acting for ${action.onBehalfOf}` : ''}
                {action.stepUpRequired ? ' · sensitive, needs a PIN' : ''}
              </p>
            </div>
          </div>
          <StatusBadge tone={variant.tone} className="shrink-0">
            {variant.label}
          </StatusBadge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <section aria-label="What it will run">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">What it will run</p>
          {args.length === 0 ? (
            <p className="text-sm text-muted-foreground">No details to show.</p>
          ) : (
            <dl className="divide-y divide-border rounded-md border border-border">
              {args.map(([key, value]) => (
                <div key={key} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-3">
                  <dt className="text-xs text-muted-foreground">{humanize(key)}</dt>
                  <dd className="break-words text-sm text-foreground">{display(value)}</dd>
                </div>
              ))}
            </dl>
          )}
          {action.argsRedacted && args.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Values that look like an email, phone number or national id are hidden here.
            </p>
          ) : null}
        </section>

        <Separator />

        {pendingPin ? <PinStep action={action} token={token} /> : null}

        <div className="space-y-1.5 text-xs text-muted-foreground">
          {action.status === PENDING ? (
            <p>
              It runs once, with exactly these details. <RelativeTime iso={action.expiresAt} prefix="expires" />.
            </p>
          ) : (
            <p className="text-sm text-foreground">
              {AGENT_ACTION_CLOSED_COPY[action.status]}
              {action.decidedBy && action.decidedAt ? (
                <span className="text-xs text-muted-foreground">
                  {' '}
                  {action.decidedBy} · <RelativeTime iso={action.decidedAt} />
                </span>
              ) : null}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The PIN step of a sensitive write. Only the person the agent acts for can take it; anyone else is told who can.
 * With no PIN set, the person is sent to set one and brought back to this same link.
 */
export function PinStep({ action, token }: { action: AgentAction; token: string }) {
  const stepUp = useStepUpAgentAction(token);
  const [pin, setPin] = useState('');
  const pinError = stepUp.isError ? extractFieldErrors(stepUp.error)?.pin : undefined;

  if (!action.canStepUp) {
    return (
      <p className="text-sm text-muted-foreground">
        Only {action.onBehalfOf ?? 'the person this agent acts for'} can approve this, with their PIN. You can deny it.
      </p>
    );
  }

  if (!action.hasPinSet) {
    const back = `/agent-actions/${encodeURIComponent(token)}/approve`;
    return (
      <div className="space-y-1.5 text-sm">
        <p className="text-foreground">This is a sensitive change, so it needs your PIN, and you have not set one.</p>
        <Link
          href={`${PROFILE_PIN_PATH}?returnTo=${encodeURIComponent(back)}#pin-section`}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Set a PIN in your profile, then come back here
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        stepUp.mutate(pin, { onError: () => setPin('') });
      }}
    >
      <Label htmlFor="agent-action-pin" className="text-sm text-foreground">
        This is a sensitive change. Enter your PIN to approve it
      </Label>
      <div id="agent-action-pin">
        <PinInput value={pin} onChange={setPin} disabled={stepUp.isPending} />
      </div>
      {pinError ? (
        <p role="alert" className="text-sm text-critical-text">
          {pinError}
        </p>
      ) : null}
      <Button type="submit" className="gap-1.5" loading={stepUp.isPending} disabled={pin.length < 4}>
        <ShieldCheck className="h-4 w-4" />
        Approve with PIN
      </Button>
    </form>
  );
}

function humanize(key: string): string {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return typeof value === 'string' ? value : JSON.stringify(value);
}
