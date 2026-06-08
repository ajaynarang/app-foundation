'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@sally/ui';
import { useCommandCenterOverview } from '@/features/operations/tower/hooks/use-command-center';
import { useHomePulse } from '@/features/home/hooks/use-home-pulse';
import { formatCents } from '@/shared/lib/utils/formatters';

interface DynamicIslandProps {
  tenantName: string;
  planLabel: string | null;
  roleView: string;
  isOnTrial: boolean;
  daysLeftInTrial: number | null;
  isSuperAdmin: boolean;
}

/** Auto-rotation interval in ms — slow enough to not burn the eye */
const ROTATE_INTERVAL = 8000;

const EASE = [0.23, 1, 0.32, 1] as const;

export function DynamicIsland({
  tenantName,
  planLabel,
  roleView,
  isOnTrial,
  daysLeftInTrial,
  isSuperAdmin,
}: DynamicIslandProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

  // Super admins have no tenant — skip fleet metrics entirely
  const { data: overview } = useCommandCenterOverview();
  const { data: pulse } = useHomePulse();
  const kpis = isSuperAdmin ? null : overview?.kpis;
  const homePulse = isSuperAdmin ? null : pulse;

  // Auto-rotate between faces — pauses on hover, disabled for super admins
  useEffect(() => {
    if (isHovered || !kpis) return;

    const timer = setInterval(() => {
      setShowMetrics((prev) => !prev);
    }, ROTATE_INTERVAL);

    return () => clearInterval(timer);
  }, [isHovered, kpis]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
    if (kpis) setShowMetrics(true);
  }, [kpis]);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    setShowMetrics(false);
  }, []);

  const dotMeta = isOnTrial
    ? daysLeftInTrial !== null && daysLeftInTrial <= 3
      ? { cls: 'bg-critical', glow: '220,38,38' }
      : { cls: 'bg-caution', glow: '202,138,4' }
    : { cls: 'bg-info', glow: '59,130,246' };

  return (
    <div
      className="relative cursor-default select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden',
          'rounded-full',
          'border border-white/25 dark:border-white/[0.12]',
          'bg-white/60 dark:bg-white/[0.10]',
          'backdrop-blur-3xl backdrop-saturate-[1.8]',
          'shadow-[0_2px_8px_rgba(0,0,0,0.06),0_0_0_0.5px_rgba(255,255,255,0.3),inset_0_1px_0_rgba(255,255,255,0.5)]',
          'dark:shadow-[0_2px_8px_rgba(0,0,0,0.3),0_0_0_0.5px_rgba(255,255,255,0.05),inset_0_1px_0_rgba(255,255,255,0.08)]',
        )}
        style={{
          height: 34,
          padding: '0 20px',
        }}
      >
        {/* Invisible spacer — always rendered so the pill has intrinsic width from tenant text */}
        <div className="flex items-center whitespace-nowrap invisible" aria-hidden>
          <span className="h-[5px] w-[5px] mr-2 flex-shrink-0" />
          <span className="text-xs">{isSuperAdmin ? 'SALLY' : tenantName}</span>
          {planLabel && (
            <>
              <span className="mx-1.5 text-xs">·</span>
              <span className="text-xs">{planLabel}</span>
            </>
          )}
          <span className="mx-1.5 text-xs">·</span>
          <span className="text-xs">{isSuperAdmin ? 'Super Admin' : roleView}</span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!showMetrics ? (
            /* ── Tenant info ── */
            <motion.div
              key="tenant"
              className="flex items-center justify-center whitespace-nowrap absolute inset-x-0 px-5"
              initial={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              {/* Pulse dot */}
              <motion.div
                className={cn('h-[5px] w-[5px] rounded-full flex-shrink-0 mr-2', dotMeta.cls)}
                animate={{
                  opacity: [0.6, 1, 0.6],
                  boxShadow: [
                    `0 0 2px rgba(${dotMeta.glow},0.2)`,
                    `0 0 6px rgba(${dotMeta.glow},0.45)`,
                    `0 0 2px rgba(${dotMeta.glow},0.2)`,
                  ],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              />

              <span className="text-xs font-medium text-foreground tracking-[-0.01em]">
                {isSuperAdmin ? 'SALLY' : tenantName}
              </span>

              {planLabel && (
                <>
                  <span className="mx-1.5 text-muted-foreground/50 text-xs">·</span>
                  <span
                    className={cn(
                      'text-xs font-medium tracking-tight',
                      isOnTrial
                        ? daysLeftInTrial !== null && daysLeftInTrial <= 3
                          ? 'text-critical'
                          : 'text-caution'
                        : 'text-info',
                    )}
                  >
                    {planLabel}
                  </span>
                </>
              )}

              <span className="mx-1.5 text-muted-foreground/50 text-xs">·</span>
              <span className="text-xs text-muted-foreground font-medium">
                {isSuperAdmin ? 'Super Admin' : roleView}
              </span>
            </motion.div>
          ) : (
            /* ── Fleet metrics ── */
            <motion.div
              key="metrics"
              className="flex items-center justify-center gap-4 whitespace-nowrap absolute inset-x-0 px-5"
              initial={{ opacity: 0, y: -6, filter: 'blur(3px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
              transition={{ duration: 0.2, ease: EASE }}
            >
              {kpis ? (
                <>
                  <CapsuleMetric value={kpis.inTransit} label="En Route" color="text-info" />
                  {kpis.activeAlerts > 0 && (
                    <CapsuleMetric value={kpis.activeAlerts} label="Alerts" color="text-caution" />
                  )}
                  {homePulse && homePulse.pendingDecisions > 0 && (
                    <CapsuleMetric value={homePulse.pendingDecisions} label="Decisions" color="text-foreground" />
                  )}
                  {homePulse && homePulse.unbilledCents > 0 && (
                    <CapsuleMetric
                      value={formatCents(homePulse.unbilledCents)}
                      label="Unbilled"
                      color="text-foreground"
                    />
                  )}
                </>
              ) : (
                <span className="text-[11px] text-muted-foreground">Loading...</span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CapsuleMetric({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className="text-center flex-shrink-0">
      <div className={cn('text-[13px] font-bold leading-none', color)}>{value}</div>
      <div className="text-2xs uppercase tracking-wide text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
