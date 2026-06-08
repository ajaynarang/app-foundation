'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent, CardFooter } from '@sally/ui/components/ui/card';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import {
  Truck,
  DollarSign,
  Users,
  ShieldCheck,
  Eye,
  Pencil,
  XCircle,
  CheckCircle2,
  Lock,
  AlertTriangle,
  ChevronDown,
  Package,
  Bell,
  Plug,
  Send,
  Activity,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/features/auth';
import { apiClient } from '@/shared/lib/api';
import { OAUTH_SCOPE_DESCRIPTIONS } from '@sally/shared-types';
import { showError } from '@sally/ui';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface ConsentChallenge {
  clientName: string;
  clientDescription: string | null;
  requestedScopes: string[];
  redirectUri: string;
  state: string;
}

type Tier = 'read' | 'standard' | 'sensitive';

interface ScopeRow {
  id: string;
  label: string;
  tier: Tier;
  /** Domain prefix (fleet, loads, ...) — used for grouping inside the standard bucket. */
  domain: string;
}

const DOMAIN_META: Record<string, { label: string; icon: LucideIcon }> = {
  fleet: { label: 'Fleet', icon: Truck },
  loads: { label: 'Loads', icon: Package },
  invoices: { label: 'Invoices', icon: DollarSign },
  settlements: { label: 'Settlements', icon: DollarSign },
  billing: { label: 'Billing', icon: DollarSign },
  customers: { label: 'Customers', icon: Users },
  shield: { label: 'Compliance', icon: ShieldCheck },
  documents: { label: 'Documents', icon: ShieldCheck },
  alerts: { label: 'Alerts', icon: Bell },
  integrations: { label: 'Integrations', icon: Plug },
  comms: { label: 'Communications', icon: Send },
};

function tierForScope(scopeId: string): Tier {
  if (scopeId.endsWith(':sensitive')) return 'sensitive';
  if (scopeId.endsWith(':write') || scopeId.endsWith(':send')) return 'standard';
  if (scopeId.endsWith(':bulk')) return 'standard';
  return 'read';
}

function decodeChallenge(token: string): ConsentChallenge | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      clientName: payload.clientName,
      clientDescription: payload.clientDescription,
      requestedScopes: payload.requestedScopes,
      redirectUri: payload.redirectUri,
      state: payload.state,
    };
  } catch {
    return null;
  }
}

export default function OAuthConsentPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const challengeToken = searchParams.get('challenge');
  const { accessToken, user } = useAuthStore();

  const [submitting, setSubmitting] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [readsExpanded, setReadsExpanded] = useState(false);
  const [standardExpanded, setStandardExpanded] = useState(true);

  const challenge = useMemo(() => (challengeToken ? decodeChallenge(challengeToken) : null), [challengeToken]);

  const rows = useMemo<ScopeRow[]>(() => {
    if (!challenge) return [];
    return challenge.requestedScopes.map((id) => {
      const [domain] = id.split(':');
      return {
        id,
        label: OAUTH_SCOPE_DESCRIPTIONS[id] ?? id,
        tier: tierForScope(id),
        domain,
      };
    });
  }, [challenge]);

  // Default selection: all checked
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (rows.length > 0 && selected.size === 0) {
      setSelected(new Set(rows.map((r) => r.id)));
    }
    // we intentionally do NOT depend on `selected` to avoid a reset loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length]);

  const sensitive = rows.filter((r) => r.tier === 'sensitive');
  const standard = rows.filter((r) => r.tier === 'standard');
  const reads = rows.filter((r) => r.tier === 'read');

  const counts = {
    read: reads.filter((r) => selected.has(r.id)).length,
    standard: standard.filter((r) => selected.has(r.id)).length,
    sensitive: sensitive.filter((r) => selected.has(r.id)).length,
  };
  const totalSelected = counts.read + counts.standard + counts.sensitive;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = (groupRows: ScopeRow[], newState: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      groupRows.forEach((r) => {
        if (newState) next.add(r.id);
        else next.delete(r.id);
      });
      return next;
    });
  };

  const groupChecked = (groupRows: ScopeRow[]): boolean | 'indeterminate' => {
    const n = groupRows.filter((r) => selected.has(r.id)).length;
    if (n === 0) return false;
    if (n === groupRows.length) return true;
    return 'indeterminate';
  };

  // Group standard writes by domain
  const standardByDomain = useMemo(() => {
    const m = new Map<string, ScopeRow[]>();
    for (const r of standard) {
      const arr = m.get(r.domain) ?? [];
      arr.push(r);
      m.set(r.domain, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [standard]);

  useEffect(() => {
    if (!accessToken) {
      const returnTo = `/oauth/consent?challenge=${encodeURIComponent(challengeToken || '')}`;
      router.push(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    }
  }, [accessToken, challengeToken, router]);

  if (!challengeToken || !challenge) {
    return (
      <FullPageShell>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <p className="text-muted-foreground">Invalid or missing authorization request.</p>
          </CardContent>
        </Card>
      </FullPageShell>
    );
  }

  if (!accessToken) {
    return (
      <FullPageShell>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 space-y-4">
            <Skeleton className="mx-auto h-14 w-14 rounded-2xl" />
            <Skeleton className="mx-auto h-5 w-48" />
            <Skeleton className="mx-auto h-4 w-64" />
            <Skeleton className="mx-auto h-32 w-full rounded-lg" />
          </CardContent>
        </Card>
      </FullPageShell>
    );
  }

  async function handleApprove() {
    if (totalSelected === 0) {
      showError('Select at least one permission, or click Deny.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await apiClient<{ redirectUrl: string }>('/oauth/authorize/consent', {
        method: 'POST',
        body: JSON.stringify({
          challenge: challengeToken,
          selectedScopes: Array.from(selected),
        }),
      });
      setAuthorized(true);
      setTimeout(() => {
        window.location.href = result.redirectUrl;
      }, 500);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[OAuth Consent] Approve failed:', err);
      showError(extractErrorMessage(err) || 'Failed to approve consent');
      setSubmitting(false);
    }
  }

  function handleDeny() {
    if (!challenge) return;
    const redirectUrl = new URL(challenge.redirectUri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('state', challenge.state);
    window.location.href = redirectUrl.toString();
  }

  if (authorized) {
    return (
      <FullPageShell>
        <Card className="w-full max-w-md">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-emerald-600 dark:text-emerald-500" />
            <h2 className="text-lg font-semibold text-foreground">Authorization granted</h2>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting back to {challenge?.clientName}…</p>
          </CardContent>
        </Card>
      </FullPageShell>
    );
  }

  const tenantLabel = user?.tenantName || user?.tenantId || 'your workspace';
  const redirectHost = (() => {
    try {
      return new URL(challenge.redirectUri).hostname;
    } catch {
      return challenge.redirectUri;
    }
  })();

  return (
    <div className="min-h-screen bg-background flex items-stretch sm:items-center justify-center sm:p-4">
      <Card className="w-full max-w-2xl flex flex-col max-h-screen sm:max-h-[90vh] overflow-hidden">
        {/* ── Sticky header ───────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b border-border bg-card sticky top-0 z-10">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <span className="text-lg font-bold">{challenge.clientName.charAt(0).toUpperCase()}</span>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-base font-semibold text-foreground truncate">Authorize {challenge.clientName}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                wants access to <span className="font-medium text-foreground">{tenantLabel}</span> as{' '}
                <span className="font-medium text-foreground">{user?.email || user?.firstName}</span>
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 truncate">
                <Lock className="inline h-3 w-3 mr-1" />
                Will redirect to {redirectHost}
              </p>
            </div>
          </div>

          {/* Live count chips */}
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <CountChip tone="muted" icon={Eye} label={`${counts.read} read`} dim={counts.read === 0} />
            <CountChip tone="caution" icon={Pencil} label={`${counts.standard} write`} dim={counts.standard === 0} />
            <CountChip
              tone="critical"
              icon={AlertTriangle}
              label={`${counts.sensitive} require PIN`}
              dim={counts.sensitive === 0}
            />
          </div>
        </div>

        {/* ── Scrollable body ─────────────────────────────────────── */}
        <CardContent className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* SENSITIVE — always open, visually loud */}
          {sensitive.length > 0 && (
            <section className="rounded-lg border border-destructive/30 bg-destructive/5">
              <header className="flex items-start gap-2 px-4 pt-3 pb-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Sensitive actions ({sensitive.length})</h2>
                  <p className="text-xs text-muted-foreground">
                    Each call also requires your PIN before it runs. Default: none granted.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleAll(sensitive, counts.sensitive < sensitive.length)}
                  className="text-xs font-medium text-destructive hover:underline whitespace-nowrap"
                >
                  {counts.sensitive === sensitive.length ? 'Uncheck all' : 'Check all'}
                </button>
              </header>
              <ul className="px-4 pb-3 space-y-1">
                {sensitive.map((r) => (
                  <ScopeListItem key={r.id} row={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} />
                ))}
              </ul>
            </section>
          )}

          {/* STANDARD WRITE — open by default, collapsible */}
          {standard.length > 0 && (
            <section className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setStandardExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
              >
                <Pencil className="h-4 w-4 text-caution shrink-0" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Standard writes ({standard.length})</h2>
                  <p className="text-xs text-muted-foreground">
                    Confirms each call. {counts.standard} of {standard.length} selected.
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    standardExpanded ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {standardExpanded && (
                <div className="px-4 pb-3 space-y-3 border-t border-border pt-3">
                  {standardByDomain.map(([domain, drows]) => {
                    const meta = DOMAIN_META[domain] ?? {
                      label: domain.charAt(0).toUpperCase() + domain.slice(1),
                      icon: Activity,
                    };
                    const Icon = meta.icon;
                    const groupState = groupChecked(drows);
                    return (
                      <div key={domain}>
                        <div className="flex items-center gap-2 mb-1">
                          <Checkbox checked={groupState} onCheckedChange={(v) => toggleAll(drows, v === true)} />
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium text-foreground">{meta.label}</span>
                        </div>
                        <ul className="ml-6 space-y-1">
                          {drows.map((r) => (
                            <ScopeListItem
                              key={r.id}
                              row={r}
                              checked={selected.has(r.id)}
                              onToggle={() => toggle(r.id)}
                            />
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* READ-ONLY — collapsed by default */}
          {reads.length > 0 && (
            <section className="rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setReadsExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
              >
                <Eye className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <h2 className="text-sm font-semibold text-foreground">Read-only access ({reads.length})</h2>
                  <p className="text-xs text-muted-foreground">
                    No data changes. {counts.read} of {reads.length} selected.
                  </p>
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${readsExpanded ? 'rotate-180' : ''}`}
                />
              </button>
              {readsExpanded && (
                <ul className="px-4 pb-3 space-y-1 border-t border-border pt-3">
                  {reads.map((r) => (
                    <ScopeListItem key={r.id} row={r} checked={selected.has(r.id)} onToggle={() => toggle(r.id)} />
                  ))}
                </ul>
              )}
            </section>
          )}
        </CardContent>

        {/* ── Sticky footer ───────────────────────────────────────── */}
        <CardFooter className="flex-col gap-3 px-6 py-4 border-t border-border bg-card">
          <div className="w-full text-[11px] text-muted-foreground space-y-0.5">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3" />
              Every action is logged in your Activity feed.
            </div>
            <div className="flex items-center gap-1.5">
              <Lock className="h-3 w-3" />
              Revoke at any time in Settings → External agents.
            </div>
          </div>
          <div className="flex w-full gap-3">
            <Button variant="outline" className="flex-1" onClick={handleDeny} disabled={submitting}>
              Deny
            </Button>
            <Button className="flex-1" onClick={handleApprove} loading={submitting} disabled={totalSelected === 0}>
              Authorize {totalSelected} {totalSelected === 1 ? 'permission' : 'permissions'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

function FullPageShell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-background p-4">{children}</div>;
}

function CountChip({
  tone,
  icon: Icon,
  label,
  dim,
}: {
  tone: 'muted' | 'caution' | 'critical';
  icon: LucideIcon;
  label: string;
  dim: boolean;
}) {
  const colors =
    tone === 'critical'
      ? 'bg-destructive/10 text-destructive'
      : tone === 'caution'
        ? 'bg-caution/10 text-caution'
        : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${colors} ${dim ? 'opacity-50' : ''}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function ScopeListItem({ row, checked, onToggle }: { row: ScopeRow; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <label className="flex items-start gap-2 py-1 text-sm cursor-pointer group">
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
        <div className="flex-1 min-w-0">
          <span
            className={
              checked ? 'text-foreground' : 'text-muted-foreground line-through decoration-muted-foreground/40'
            }
          >
            {row.label}
          </span>
          <span className="ml-2 font-mono text-[10px] text-muted-foreground/70">{row.id}</span>
        </div>
      </label>
    </li>
  );
}
