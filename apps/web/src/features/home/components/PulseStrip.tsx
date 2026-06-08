'use client';

import { useMemo, useCallback, Fragment } from 'react';
import { motion } from 'framer-motion';
import { useCommandCenterOverview } from '@/features/operations/tower/hooks/use-command-center';
import { useHomePulse } from '../hooks/use-home-pulse';
import { formatCents } from '@/shared/lib/utils/formatters';

// ── Pulse item configuration ──────────────────────────────────────────────
// Home strip and the DynamicIsland header pill must show the SAME set of
// metrics with the SAME numbers. En-route and alerts come from the
// command-center overview (shared query cache → identical values across
// both surfaces). Decisions + unbilled come from home pulse.

type PulseKind = 'enRoute' | 'alerts' | 'decisions' | 'unbilled';

interface PulseConfig {
  key: PulseKind;
  label: string;
  href: string;
  /** Hide when the value is zero (alerts, decisions, unbilled). */
  hideWhenZero: boolean;
  /** Tailwind class for the leading status dot. Empty string = no dot. */
  dotClass: string;
  /** Tailwind text color applied to the value. */
  valueColorClass: (value: number) => string;
  /** Optional formatter — defaults to value.toLocaleString(). */
  format?: (value: number) => string;
}

const PULSE_CONFIGS: PulseConfig[] = [
  {
    key: 'enRoute',
    label: 'en route',
    href: '/dispatcher/tower',
    hideWhenZero: false,
    dotClass: 'bg-info',
    valueColorClass: () => 'text-info',
  },
  {
    key: 'alerts',
    label: 'alerts',
    href: '/dispatcher/alerts',
    hideWhenZero: true,
    dotClass: 'bg-caution',
    valueColorClass: () => 'text-caution',
  },
  {
    key: 'decisions',
    label: 'decisions',
    href: '/dispatcher/desk',
    hideWhenZero: true,
    dotClass: 'bg-accent',
    valueColorClass: () => 'text-foreground',
  },
  {
    key: 'unbilled',
    label: 'unbilled',
    href: '/dispatcher/close-out',
    hideWhenZero: true,
    dotClass: 'bg-caution',
    valueColorClass: () => 'text-foreground',
    format: (cents: number) => formatCents(cents),
  },
];

// ── Single inline pulse item ──────────────────────────────────────────────

function PulseItem({
  config,
  value,
  onNavigate,
}: {
  config: PulseConfig;
  value: number;
  onNavigate: (href: string) => void;
}) {
  const formatted = config.format ? config.format(value) : value.toLocaleString();
  const handleClick = useCallback(() => {
    onNavigate(config.href);
  }, [config.href, onNavigate]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:text-foreground"
    >
      {config.dotClass && (
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dotClass}`} aria-hidden="true" />
      )}
      <span className={`font-medium group-hover:text-foreground ${config.valueColorClass(value)}`}>{formatted}</span>
      <span className="group-hover:underline underline-offset-4 decoration-muted-foreground/40">{config.label}</span>
    </button>
  );
}

// ── PulseStrip ────────────────────────────────────────────────────────────

interface PulseStripProps {
  onNavigate: (href: string) => void;
}

export function PulseStrip({ onNavigate }: PulseStripProps) {
  const { data: overview, isLoading: overviewLoading, isError: overviewError } = useCommandCenterOverview();
  const { data: pulse, isLoading: pulseLoading, isError: pulseError } = useHomePulse();

  const values = useMemo<Record<PulseKind, number> | null>(() => {
    if (!overview?.kpis || !pulse) return null;
    return {
      enRoute: overview.kpis.inTransit,
      alerts: overview.kpis.activeAlerts,
      decisions: pulse.pendingDecisions,
      unbilled: pulse.unbilledCents,
    };
  }, [overview, pulse]);

  const visibleItems = useMemo(() => {
    if (!values) return [];
    return PULSE_CONFIGS.filter((config) => {
      if (config.hideWhenZero && values[config.key] === 0) return false;
      return true;
    });
  }, [values]);

  if (overviewLoading || pulseLoading || overviewError || pulseError || !values || visibleItems.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 max-w-3xl"
      role="status"
      aria-label="Fleet status"
    >
      {visibleItems.map((config, idx) => (
        <Fragment key={config.key}>
          {idx > 0 && (
            <span className="text-muted-foreground/40" aria-hidden="true">
              ·
            </span>
          )}
          <PulseItem config={config} value={values[config.key]} onNavigate={onNavigate} />
        </Fragment>
      ))}
    </motion.div>
  );
}
