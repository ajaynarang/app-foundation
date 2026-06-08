'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { showSuccess, showError } from '@sally/ui';
import { AlertCircle, CheckCircle2, Clock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { PinInput } from '@/components/ui/pin-input';
import { apiClient, ApiError } from '@/shared/lib/api';
import { useAuthStore } from '@/features/auth';

interface ChallengeContext {
  token: string;
  tool: string;
  tier: 'standard' | 'sensitive';
  scopeRequired: string;
  callerLabel: string;
  callerKind: 'user' | 'oauth_client' | 'api_key' | 'desk_responsibility';
  expiresAt: string;
  requiresStepUp: boolean;
  stepUpCompleted: boolean;
  consumed: boolean;
  expired: boolean;
  hasPinSet: boolean;
}

function formatToolName(slug: string): string {
  return slug
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

function formatCallerKind(kind: ChallengeContext['callerKind']): string {
  switch (kind) {
    case 'oauth_client':
      return 'External agent (OAuth)';
    case 'api_key':
      return 'API key';
    case 'desk_responsibility':
      return "Sally's Desk";
    case 'user':
      return 'User session';
  }
}

export default function AgentActionApprovePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { isAuthenticated, _hasHydrated } = useAuthStore();

  const [ctx, setCtx] = useState<ChallengeContext | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!isAuthenticated) {
      const here = `/agent-actions/${token}/approve`;
      router.replace(`/login?returnTo=${encodeURIComponent(here)}`);
      return;
    }

    apiClient<ChallengeContext>(`/mcp/hitl/${token}`)
      .then((data) => setCtx(data))
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 404) {
          setLoadError('This approval link is invalid or belongs to another tenant.');
        } else if (err instanceof ApiError && err.status === 403) {
          setLoadError('Your role does not allow approving agent actions.');
        } else {
          setLoadError('Could not load this approval request.');
        }
      });
  }, [_hasHydrated, isAuthenticated, router, token]);

  useEffect(() => {
    if (!ctx) return;
    const tick = () => {
      const ms = new Date(ctx.expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ctx]);

  const handleApprove = async () => {
    if (pin.length < 4) return;
    setSubmitting(true);
    try {
      await apiClient(`/mcp/hitl/${token}/step-up`, {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      showSuccess('Approved — the agent can now complete the action.');
      setDone(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        const data = err.data as { code?: string; message?: string } | undefined;
        if (data?.code === 'no_pin') {
          showError('You need to set a PIN before you can approve sensitive actions.');
          if (ctx) setCtx({ ...ctx, hasPinSet: false });
        } else {
          showError(err.message || 'PIN was not accepted.');
          setPin('');
        }
      } else {
        showError('Could not submit approval.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!_hasHydrated) {
    return (
      <CenteredShell>
        <Skeleton className="h-64 w-full" />
      </CenteredShell>
    );
  }

  if (loadError) {
    return (
      <CenteredShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Cannot load approval
            </CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push('/dispatcher')}>
              Back to dashboard
            </Button>
          </CardContent>
        </Card>
      </CenteredShell>
    );
  }

  if (!ctx) {
    return (
      <CenteredShell>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2 mt-2" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
      </CenteredShell>
    );
  }

  const isExpired = ctx.expired || (secondsLeft ?? 0) === 0;
  const alreadyApproved = ctx.stepUpCompleted && !ctx.consumed;

  if (done || alreadyApproved) {
    return (
      <CenteredShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
              Approved
            </CardTitle>
            <CardDescription>
              {alreadyApproved && !done
                ? 'You already approved this request. The agent can complete it.'
                : 'The agent can now complete the action.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">You can close this tab.</p>
          </CardContent>
        </Card>
      </CenteredShell>
    );
  }

  if (ctx.consumed) {
    return (
      <CenteredShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
              Already completed
            </CardTitle>
            <CardDescription>This action was already executed by the agent.</CardDescription>
          </CardHeader>
        </Card>
      </CenteredShell>
    );
  }

  if (isExpired) {
    return (
      <CenteredShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-caution" />
              Approval expired
            </CardTitle>
            <CardDescription>
              The agent waited too long. Ask it to try again — a fresh approval link will be issued.
            </CardDescription>
          </CardHeader>
        </Card>
      </CenteredShell>
    );
  }

  if (!ctx.hasPinSet) {
    const target = `/settings/profile?returnTo=${encodeURIComponent(`/agent-actions/${token}/approve`)}#pin-section`;
    return (
      <CenteredShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-caution" />
              Set a PIN to approve agent actions
            </CardTitle>
            <CardDescription>
              Sensitive actions need a 4-digit PIN as a second factor. Set one in your profile, then come back here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3 text-sm">
              <div>
                <span className="text-muted-foreground">Agent: </span>
                <span className="font-medium">{ctx.callerLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Action: </span>
                <span className="font-medium">{formatToolName(ctx.tool)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => router.push(target)}>Set my PIN</Button>
              <Button
                variant="outline"
                onClick={() =>
                  apiClient<ChallengeContext>(`/mcp/hitl/${token}`)
                    .then(setCtx)
                    .catch(() => {
                      /* keep current state */
                    })
                }
              >
                I&apos;ve set it — refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </CenteredShell>
    );
  }

  return (
    <CenteredShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-foreground" />
            Approve agent action
          </CardTitle>
          <CardDescription>
            An agent is asking permission to run a sensitive action in your tenant. Confirm with your PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div>
              <span className="text-muted-foreground">Caller: </span>
              <span className="font-medium">{ctx.callerLabel}</span>{' '}
              <span className="text-muted-foreground">({formatCallerKind(ctx.callerKind)})</span>
            </div>
            <div>
              <span className="text-muted-foreground">Action: </span>
              <span className="font-medium">{formatToolName(ctx.tool)}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Permission: </span>
              <code className="text-xs">{ctx.scopeRequired}</code>
            </div>
            {secondsLeft !== null && (
              <div>
                <span className="text-muted-foreground">Expires in: </span>
                <span className="font-medium">{secondsLeft}s</span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Enter your 4-digit PIN</p>
            <PinInput value={pin} onChange={setPin} disabled={submitting} />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleApprove} loading={submitting} disabled={pin.length < 4 || isExpired}>
              Approve
            </Button>
            <Button variant="outline" onClick={() => router.push('/dispatcher')} disabled={submitting}>
              Cancel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Approving only unlocks this single request. The agent must still replay the call within{' '}
            {secondsLeft ?? 'the remaining'} seconds.
          </p>
        </CardContent>
      </Card>
    </CenteredShell>
  );
}

function CenteredShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
