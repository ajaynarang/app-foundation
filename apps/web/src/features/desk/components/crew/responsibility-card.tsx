'use client';

import { useState } from 'react';
import { Calendar, ChevronRight, Info, Lock, MousePointerClick, Play, Settings2, Webhook, Zap } from 'lucide-react';

import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Switch } from '@/shared/components/ui/switch';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';

import {
  useResponsibility,
  useResponsibilityUISpec,
  useRunResponsibility,
  useToggleResponsibilityAutonomy,
} from '../../hooks/use-responsibilities';
import { useDeskSchedule } from '../../hooks/use-desk-schedule';
import { describeCron, triggerPhrase, type TriggerIcon } from '../../lib/trigger-phrasing';
import { deriveToolTier, type ToolTier } from '../../lib/tool-tier';
import { summarizeConditions } from '../../lib/summarize-conditions';
import { LIFECYCLE_LABELS, TRUST_LEVEL_LABELS } from '../../constants';
import type { DeskResponsibilityListItem, TrustLevel } from '../../types';

import { ResponsibilityRulesSheet } from './responsibility-rules-sheet';
import { TrustLevelSlider } from './trust-level-slider';

interface ResponsibilityCardProps {
  item: DeskResponsibilityListItem;
  canEdit: boolean;
  pendingEnabled?: boolean;
  pendingTrustLevel?: TrustLevel;
  pendingConditions?: Record<string, unknown>;
  onToggleEnabled: (enabled: boolean) => void;
  onTrustLevelChange: (next: TrustLevel) => void;
  onConditionsChange: (next: Record<string, unknown>) => void;
}

/**
 * Per-responsibility card inside the Responsibilities tab.
 * Collapsed by default — click the row header (or chevron) to expand.
 * Collapsed shows: status dot · title · mono key · Active/Coming soon ·
 * trust level badge · enable switch · chevron.
 */
export function ResponsibilityCard({
  item,
  canEdit,
  pendingEnabled,
  pendingTrustLevel,
  pendingConditions,
  onToggleEnabled,
  onTrustLevelChange,
  onConditionsChange,
}: ResponsibilityCardProps) {
  const detail = useResponsibility(item.key);
  const uiSpec = useResponsibilityUISpec(item.key);
  const runMutation = useRunResponsibility();
  const autonomyToggle = useToggleResponsibilityAutonomy();
  const deskSchedule = useDeskSchedule();
  const [expanded, setExpanded] = useState(false);
  const [rulesSheetOpen, setRulesSheetOpen] = useState(false);

  if (detail.isLoading || uiSpec.isLoading || !detail.data) {
    return <Skeleton className="h-14 w-full rounded-md" />;
  }

  const d = detail.data;
  const isComingSoon = item.lifecycle === 'COMING_SOON';
  const effectiveEnabled = pendingEnabled ?? d.enabled;
  const effectiveTrust = pendingTrustLevel ?? d.trustLevel;
  const effectiveConditions = pendingConditions ?? (d.conditions as Record<string, unknown>);
  const fieldsDisabled = !canEdit || isComingSoon;

  const rawTriggers = uiSpec.data?.triggers ?? [];
  const hasManualTrigger = rawTriggers.some((t) => (t as { kind?: string }).kind === 'manual');
  const triggers = rawTriggers.map((t) => triggerPhrase(t as Parameters<typeof triggerPhrase>[0]));
  const scheduledTrigger = rawTriggers.find((t) => (t as { kind?: string }).kind === 'scheduled') as
    | { cron?: string }
    | undefined;
  const tools = uiSpec.data?.tools ?? [];
  const canRunNow = hasManualTrigger && canEdit && !isComingSoon && effectiveEnabled;

  // The tenant master switch gates every per-responsibility autonomy switch.
  // When it's off, the per-responsibility toggle still reflects its own state
  // but is visually subordinate — flipping it changes nothing until automatic
  // runs are armed tenant-wide.
  const masterScheduleOn = deskSchedule.data?.enabled ?? false;
  const autonomyEnabled = d.autonomyEnabled;

  return (
    <article className="overflow-hidden rounded-md border border-border bg-card">
      <header
        className={cn(
          'grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3',
          'transition-colors hover:bg-muted/30',
        )}
      >
        {/* Left: clickable title region (row + expand toggle) */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="contents text-left"
          aria-expanded={expanded}
          aria-controls={`resp-${item.key}`}
        >
          <span
            className={cn(
              'h-2 w-2 shrink-0 rounded-full',
              isComingSoon ? 'bg-muted' : effectiveEnabled ? 'bg-emerald-500 dark:bg-emerald-400' : 'bg-muted',
            )}
            aria-hidden
          />
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-sm font-medium text-foreground">{item.title}</h3>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {item.key}
            </code>
            {isComingSoon ? (
              <Badge variant="muted" className="text-[10px] uppercase tracking-wider">
                {LIFECYCLE_LABELS[item.lifecycle]}
              </Badge>
            ) : (
              <Badge variant="default" className="text-[10px] uppercase tracking-wider">
                {LIFECYCLE_LABELS[item.lifecycle]}
              </Badge>
            )}
            {!isComingSoon && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {TRUST_LEVEL_LABELS[effectiveTrust].label}
              </Badge>
            )}
            {/* Autonomy state, visible without expanding the row. "Auto" =
                may run on its own (any non-manual trigger); "Manual" = only
                runs when a human clicks Run now. */}
            {!isComingSoon &&
              (autonomyEnabled ? (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400"
                >
                  Auto
                </Badge>
              ) : (
                <Badge variant="muted" className="text-[10px] uppercase tracking-wider">
                  Manual
                </Badge>
              ))}
          </div>
        </button>

        {/* Right: switch + chevron. Switch is separate so click doesn't toggle card. */}
        <div className="flex items-center gap-3">
          {!isComingSoon && (
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                aria-label={effectiveEnabled ? 'Pause responsibility' : 'Enable responsibility'}
                checked={effectiveEnabled}
                onCheckedChange={onToggleEnabled}
                disabled={fieldsDisabled}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-muted/50"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight className={cn('h-4 w-4 transition-transform', expanded && 'rotate-90')} aria-hidden />
          </button>
        </div>
      </header>

      {expanded && (
        <div id={`resp-${item.key}`} className="border-t border-border px-4 py-4">
          {isComingSoon ? (
            <p className="text-sm italic text-muted-foreground">
              Configuration unlocks when this responsibility ships.
            </p>
          ) : (
            <div className="space-y-5">
              {item.description && <p className="text-xs leading-relaxed text-muted-foreground">{item.description}</p>}

              {d.lastRunAt && (
                <p className="text-xs text-muted-foreground">Last run · {formatRelativeTime(d.lastRunAt)}</p>
              )}

              <TrustSection
                value={effectiveTrust}
                onChange={onTrustLevelChange}
                disabled={fieldsDisabled}
                respKey={d.key}
              />

              {(triggers.length > 0 || hasManualTrigger) && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Triggers</Label>
                    {canRunNow && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={runMutation.isPending}
                        onClick={() => runMutation.mutate(d.key)}
                      >
                        <Play className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        Run now
                      </Button>
                    )}
                  </div>
                  {triggers.length > 0 && (
                    <ul className="space-y-1">
                      {triggers.map((t, i) => (
                        <li key={`${t.icon}-${i}`} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <TriggerIconNode icon={t.icon} />
                          <span>{t.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  {scheduledTrigger?.cron && (
                    <AutonomyToggle
                      respKey={d.key}
                      cron={scheduledTrigger.cron}
                      autonomyEnabled={autonomyEnabled}
                      masterScheduleOn={masterScheduleOn}
                      canEdit={canEdit}
                      isPending={autonomyToggle.isPending}
                      onToggle={(next) => autonomyToggle.mutate({ key: d.key, autonomyEnabled: next })}
                    />
                  )}
                </section>
              )}

              {uiSpec.data?.conditionsUI && (
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Hard rules</Label>
                    {!isComingSoon && (
                      <Button type="button" variant="outline" size="sm" onClick={() => setRulesSheetOpen(true)}>
                        <Settings2 className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                        {canEdit ? 'Edit rules' : 'View rules'}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {summarizeConditions(uiSpec.data.conditionsUI, effectiveConditions)}
                  </p>
                </section>
              )}

              {tools.length > 0 && (
                <section className="space-y-2">
                  <Label className="text-sm font-medium">Access</Label>
                  <ul className="flex flex-wrap gap-1.5">
                    {tools.map((t) => (
                      <ToolBadge key={t} name={t} />
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Sensitive tools always require your approval, regardless of trust level.
                  </p>
                </section>
              )}

              {/* Free-form rules retired — now live as operator-authored
                  playbook memories, edited from the agent sheet's Rules tab.
                  Surface a one-line pointer so dispatchers find them. */}
              <p className="text-xs text-muted-foreground">
                Free-form guidance for Sally lives in the <span className="font-medium text-foreground">Rules</span> tab
                on the agent sheet.
              </p>
            </div>
          )}
        </div>
      )}

      <ResponsibilityRulesSheet
        open={rulesSheetOpen}
        onOpenChange={setRulesSheetOpen}
        responsibilityKey={d.key}
        responsibilityTitle={item.title}
        readOnly={!canEdit}
      />
    </article>
  );
}

/**
 * "Run automatically" switch for a single responsibility. The switch governs
 * autonomy broadly — any non-manual trigger (scheduled today; domain-event /
 * webhook later). Off ⇒ manual-only caption; on ⇒ the cron in plain English
 * (when it'll auto-run on schedule). When the tenant master switch is off the
 * whole control is visually subordinated with a note pointing at the master
 * switch — the per-responsibility flag is real but inert until automatic runs
 * are armed tenant-wide.
 */
function AutonomyToggle({
  respKey,
  cron,
  autonomyEnabled,
  masterScheduleOn,
  canEdit,
  isPending,
  onToggle,
}: {
  respKey: string;
  cron: string;
  autonomyEnabled: boolean;
  masterScheduleOn: boolean;
  canEdit: boolean;
  isPending: boolean;
  onToggle: (next: boolean) => void;
}) {
  const switchId = `autonomy-${respKey}`;
  return (
    <div className={cn('space-y-2 rounded-md border border-border bg-muted/20 p-3', !masterScheduleOn && 'opacity-70')}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor={switchId} className="text-sm font-medium">
            Run automatically
          </Label>
          <p className="text-xs text-muted-foreground">
            {autonomyEnabled ? describeCron(cron) : 'Manual only — won’t run automatically.'}
          </p>
        </div>
        <Switch
          id={switchId}
          aria-label={autonomyEnabled ? 'Turn off automatic runs' : 'Turn on automatic runs'}
          checked={autonomyEnabled}
          onCheckedChange={onToggle}
          disabled={!canEdit || isPending}
        />
      </div>
      {autonomyEnabled && !masterScheduleOn && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Turn on automatic runs above to enable this — all automatic runs are paused tenant-wide.
        </p>
      )}
    </div>
  );
}

function TrustSection({
  value,
  onChange,
  disabled,
  respKey,
}: {
  value: TrustLevel;
  onChange: (next: TrustLevel) => void;
  disabled?: boolean;
  respKey: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Label htmlFor={`trust-${respKey}`} className="text-sm font-medium">
          Trust level
        </Label>
        <Badge variant="default" className="text-[10px] uppercase tracking-wider">
          {TRUST_LEVEL_LABELS[value].label}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{TRUST_LEVEL_LABELS[value].description}</p>
      <TrustLevelSlider value={value} onChange={onChange} disabled={disabled} id={`trust-${respKey}`} />
    </section>
  );
}

function ToolBadge({ name }: { name: string }) {
  const tier: ToolTier = deriveToolTier(name);
  if (tier === 'sensitive') {
    return (
      <li>
        <Badge variant="caution" className="gap-1 font-mono text-[10px] normal-case">
          <Lock className="h-3 w-3" aria-hidden />
          {name}
        </Badge>
      </li>
    );
  }
  if (tier === 'read') {
    return (
      <li>
        <Badge variant="outline" className="font-mono text-[10px] normal-case">
          {name}
        </Badge>
      </li>
    );
  }
  return (
    <li>
      <Badge variant="muted" className="font-mono text-[10px] normal-case">
        {name}
      </Badge>
    </li>
  );
}

function TriggerIconNode({ icon }: { icon: TriggerIcon }) {
  const cls = 'h-3.5 w-3.5 shrink-0 text-muted-foreground';
  switch (icon) {
    case 'schedule':
      return <Calendar className={cls} aria-hidden />;
    case 'event':
      return <Zap className={cls} aria-hidden />;
    case 'webhook':
      return <Webhook className={cls} aria-hidden />;
    case 'manual':
      return <MousePointerClick className={cls} aria-hidden />;
    default:
      return <Info className={cls} aria-hidden />;
  }
}
