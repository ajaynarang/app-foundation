'use client';

import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import { cn } from '@sally/ui';

interface DetentionTimerProps {
  arrivedAt: string;
  loadingStartedAt?: string;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DetentionTimer({ arrivedAt, loadingStartedAt }: DetentionTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const arrivedMs = new Date(arrivedAt).getTime();
  const facilityTime = now - arrivedMs;
  const isDetention = facilityTime > 2 * 60 * 60 * 1000; // 2 hours

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Clock className={cn('h-3.5 w-3.5', isDetention ? 'text-critical' : 'text-muted-foreground')} />
        <span className={cn('text-sm font-mono', isDetention ? 'text-critical animate-pulse' : 'text-foreground')}>
          At facility: {formatDuration(facilityTime)}
        </span>
      </div>
      {loadingStartedAt && (
        <div className="flex items-center gap-2 pl-5">
          <span className="text-xs text-muted-foreground font-mono">
            Loading: {formatDuration(now - new Date(loadingStartedAt).getTime())}
          </span>
        </div>
      )}
      {isDetention && <p className="text-xs text-critical pl-5">Detention threshold exceeded</p>}
    </div>
  );
}
