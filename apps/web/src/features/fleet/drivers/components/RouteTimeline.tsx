'use client';

import { useState } from 'react';
import { Truck } from 'lucide-react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { RouteStopCard } from './RouteStopCard';
import { StopCompletionFlow } from './StopCompletionFlow';
import { DocumentUploadPrompt } from './DocumentUploadPrompt';
import type { LoadStop } from '@/features/fleet/loads/types';
import { LoadStopStatusSchema } from '@sally/shared-types';

const STOP_STATUS = LoadStopStatusSchema.enum;

interface RouteTimelineProps {
  stops: LoadStop[];
  loadId?: string;
  onNavigate?: (stop: LoadStop) => void;
  isLoading?: boolean;
  isReadOnly?: boolean;
}

function getStopState(stop: LoadStop, currentIndex: number, index: number) {
  if (stop.status === STOP_STATUS.COMPLETED) return 'completed' as const;
  if (index === currentIndex) return 'current' as const;
  return 'upcoming' as const;
}

export function RouteTimelineSkeleton() {
  return (
    <div className="space-y-4 py-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <Skeleton className="h-3 w-3 rounded-full" />
            {i < 3 && <Skeleton className="w-0.5 flex-1 mt-1" />}
          </div>
          <Skeleton className="h-20 flex-1 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

export function RouteTimeline({ stops, loadId, onNavigate, isLoading, isReadOnly }: RouteTimelineProps) {
  const [docUploadStopId, setDocUploadStopId] = useState<number | null>(null);

  if (isLoading) return <RouteTimelineSkeleton />;
  if (!stops.length) return null;

  const sorted = [...stops].sort((a, b) => a.sequenceOrder - b.sequenceOrder);
  const currentIndex = sorted.findIndex((s) => s.status !== STOP_STATUS.COMPLETED);

  return (
    <div className="relative">
      {sorted.map((stop, index) => {
        const state = getStopState(stop, currentIndex, index);
        const isLast = index === sorted.length - 1;
        const showTruck = index === currentIndex && currentIndex > 0;

        return (
          <div key={stop.id} className="flex gap-3">
            {/* Timeline column */}
            <div className="flex flex-col items-center w-4 shrink-0">
              {/* Dot */}
              <div
                className={`h-3 w-3 rounded-full mt-3 shrink-0 ${
                  state === 'completed'
                    ? 'bg-muted-foreground'
                    : state === 'current'
                      ? 'bg-foreground ring-2 ring-foreground/20'
                      : 'bg-muted border border-border'
                }`}
              />
              {/* Line */}
              {!isLast && <div className="w-0.5 flex-1 my-1 bg-border" />}
            </div>

            {/* Card */}
            <div className="flex-1 min-w-0 pb-3 relative">
              {showTruck && (
                <div className="absolute -left-8 top-2.5">
                  <Truck className="h-4 w-4 text-foreground" />
                </div>
              )}
              <RouteStopCard
                stop={stop}
                state={state}
                stopNumber={index + 1}
                onNavigate={() => onNavigate?.(stop)}
                onUploadDoc={() => setDocUploadStopId(stop.id)}
              >
                {state === 'current' && loadId && !isReadOnly && (
                  <>
                    <StopCompletionFlow stop={stop} loadId={loadId} onComplete={() => setDocUploadStopId(stop.id)} />
                    {docUploadStopId === stop.id && (
                      <DocumentUploadPrompt
                        stopId={stop.id}
                        actionType={stop.actionType}
                        onSkip={() => setDocUploadStopId(null)}
                        onUploadComplete={() => setDocUploadStopId(null)}
                      />
                    )}
                  </>
                )}
                {/* Doc upload prompt triggered from badge on completed stops */}
                {state === 'completed' && docUploadStopId === stop.id && (
                  <DocumentUploadPrompt
                    stopId={stop.id}
                    actionType={stop.actionType}
                    onSkip={() => setDocUploadStopId(null)}
                    onUploadComplete={() => setDocUploadStopId(null)}
                  />
                )}
              </RouteStopCard>
            </div>
          </div>
        );
      })}
    </div>
  );
}
