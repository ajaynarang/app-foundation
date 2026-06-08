'use client';

import { useState } from 'react';
import { SESSION_KEYS } from '@/shared/constants';
import { Check, MapPin, Truck } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { cn } from '@sally/ui';
import { useUpdateStopStatus } from '../hooks/use-stop-actions';
import { DetentionTimer } from './DetentionTimer';
import type { LoadStop } from '@/features/fleet/loads/types';

interface StopCompletionFlowProps {
  stop: LoadStop;
  loadId: string;
  onComplete?: () => void;
}

const stages = ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const;

function getStageIndex(status?: string): number {
  if (status === 'ARRIVED') return 0;
  if (status === 'IN_PROGRESS') return 1;
  if (status === 'COMPLETED') return 2;
  return -1;
}

function getActionLabel(stageIndex: number, actionType: string): string | null {
  switch (stageIndex) {
    case -1:
      return "I'm Here";
    case 0:
      return actionType === 'pickup' ? 'Start Loading' : 'Start Unloading';
    case 1:
      return 'Mark Complete';
    default:
      return null;
  }
}

function getConfirmLabel(stageIndex: number, actionType: string): string {
  switch (stageIndex) {
    case -1:
      return "Yes, I'm Here";
    case 0:
      return actionType === 'pickup' ? 'Yes, Start Loading' : 'Yes, Start Unloading';
    case 1:
      return 'Yes, Mark Complete';
    default:
      return 'Confirm';
  }
}

function getConfirmTitle(stageIndex: number): string {
  switch (stageIndex) {
    case -1:
      return 'Mark as Arrived?';
    case 0:
      return 'Start work at this stop?';
    case 1:
      return 'Mark stop as complete?';
    default:
      return 'Confirm action?';
  }
}

export function StopCompletionFlow({ stop, loadId, onComplete }: StopCompletionFlowProps) {
  const mutation = useUpdateStopStatus();
  const currentStage = getStageIndex(stop.status);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const actionLabel = getActionLabel(currentStage, stop.actionType);
  if (!actionLabel) return null;

  const handleConfirm = () => {
    const nextStatus = stages[currentStage + 1];
    if (!nextStatus) return;
    mutation.mutate(
      {
        loadId,
        stopId: stop.id,
        status: nextStatus,
        actionType: stop.actionType,
        stopCity: stop.stopCity ?? undefined,
      },
      {
        onSuccess: () => {
          setConfirmOpen(false);
          if (nextStatus === 'COMPLETED' && stop.actionType === 'delivery') {
            sessionStorage.setItem(SESSION_KEYS.LAST_DELIVERED_LOAD, loadId);
          }
          if (nextStatus === 'COMPLETED') onComplete?.();
        },
      },
    );
  };

  // Stage progress: 3 small bars instead of circles + labels
  const stageCount = 3;
  const completedBars = currentStage + 1; // -1 = 0 bars, 0 = 1 bar, 1 = 2 bars

  return (
    <>
      {/* Minimal progress bars — 3 tiny bars showing stage */}
      <div className="flex items-center gap-1">
        {Array.from({ length: stageCount }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              i < completedBars ? 'bg-foreground' : 'bg-border',
            )}
          />
        ))}
      </div>

      {/* Stage label — subtle, single line */}
      <p className="text-[11px] text-muted-foreground text-center">
        {currentStage === -1 && 'Confirm your arrival'}
        {currentStage === 0 && (stop.actionType === 'pickup' ? 'Ready to load' : 'Ready to unload')}
        {currentStage === 1 && 'Finishing up'}
      </p>

      {/* Detention timer */}
      {stop.arrivedAt && currentStage < 2 && (
        <DetentionTimer
          arrivedAt={stop.arrivedAt}
          loadingStartedAt={stop.status === 'IN_PROGRESS' ? stop.loadingStartedAt : undefined}
        />
      )}

      {/* Action button — clean, rounded, contextual icon */}
      <Button
        className="w-full h-12 rounded-xl text-sm font-semibold gap-2"
        disabled={mutation.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {currentStage === -1 && <MapPin className="h-4 w-4" />}
        {currentStage === 0 && <Truck className="h-4 w-4" />}
        {currentStage === 1 && <Check className="h-4 w-4" />}
        {actionLabel}
      </Button>

      {/* Confirmation bottom sheet */}
      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl border-border bg-card px-0 pb-8 pt-0">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1" aria-hidden>
            <div className="h-1 w-10 rounded-full bg-border" />
          </div>

          <div className="px-6">
            <SheetHeader className="text-left space-y-1 mb-6 pt-2">
              <SheetTitle>{getConfirmTitle(currentStage)}</SheetTitle>
              <SheetDescription>
                {stop.stopName}
                {stop.stopCity ? ` · ${stop.stopCity}, ${stop.stopState}` : ''}
              </SheetDescription>
              <p className="text-[11px] text-muted-foreground pt-1">This cannot be undone.</p>
            </SheetHeader>

            <div className="space-y-2">
              <Button
                className="w-full h-12 rounded-xl text-sm font-semibold"
                loading={mutation.isPending}
                onClick={handleConfirm}
              >
                {getConfirmLabel(currentStage, stop.actionType)}
              </Button>
              <Button
                variant="ghost"
                className="w-full h-12 rounded-xl text-sm"
                disabled={mutation.isPending}
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
