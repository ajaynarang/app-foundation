'use client';

import { motion } from 'framer-motion';
import { cn } from '@app/ui';

interface DynamicIslandProps {
  tenantName: string;
  planLabel: string | null;
  roleView: string;
  isOnTrial: boolean;
  daysLeftInTrial: number | null;
  isSuperAdmin: boolean;
}

/**
 * Header status pill — shows the current workspace, plan, and role.
 *
 * Rendered as a static glass pill. Features can introduce a rotating
 * metrics face by reading their own query hooks here.
 */
export function DynamicIsland({
  tenantName,
  planLabel,
  roleView,
  isOnTrial,
  daysLeftInTrial,
  isSuperAdmin,
}: DynamicIslandProps) {
  const dotMeta = isOnTrial
    ? daysLeftInTrial !== null && daysLeftInTrial <= 3
      ? { cls: 'bg-critical', glow: '220,38,38' }
      : { cls: 'bg-caution', glow: '202,138,4' }
    : { cls: 'bg-info', glow: '59,130,246' };

  return (
    <div className="relative cursor-default select-none">
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
        style={{ height: 34, padding: '0 20px' }}
      >
        <div className="flex items-center justify-center whitespace-nowrap">
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
            {isSuperAdmin ? 'Platform' : tenantName}
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
          <span className="text-xs text-muted-foreground font-medium">{isSuperAdmin ? 'Super Admin' : roleView}</span>
        </div>
      </div>
    </div>
  );
}
