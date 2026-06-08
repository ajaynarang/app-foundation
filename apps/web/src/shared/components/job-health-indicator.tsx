'use client';

import { useRouter } from 'next/navigation';
import { Activity } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/ui/components/ui/tooltip';

interface JobHealth {
  hasCritical: boolean;
  hasWarning: boolean;
  criticalCount: number;
  warningCount: number;
}

/**
 * Background-job health is a super-admin concern. The trucking app had a
 * `system-activity` feature feeding this; the generic starter ships an inert
 * indicator (renders nothing) that the platform can wire to its own health
 * source by replacing this hook.
 */
function useJobHealth(): JobHealth {
  return { hasCritical: false, hasWarning: false, criticalCount: 0, warningCount: 0 };
}

export function JobHealthIndicator() {
  const router = useRouter();
  const { hasCritical, hasWarning, criticalCount, warningCount } = useJobHealth();

  if (!hasCritical && !hasWarning) return null;

  const label = hasCritical
    ? `${criticalCount} critical job${criticalCount > 1 ? 's' : ''}`
    : `${warningCount} job warning${warningCount > 1 ? 's' : ''}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => router.push('/settings/system-activity')}
          aria-label={label}
        >
          <Activity className="h-4 w-4" />
          <span
            className={`absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-2xs font-bold text-white ${
              hasCritical ? 'bg-critical' : 'bg-caution'
            }`}
          >
            {hasCritical ? criticalCount : warningCount}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
