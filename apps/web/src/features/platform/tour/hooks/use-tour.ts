'use client';

import { useCallback } from 'react';
import { useOnborda } from 'onborda';
import { useTourStore } from '../store';
import { useUpdateTourStatus } from './use-tour-status';
import { TOUR_ID } from '../tour-steps';
import { showSuccess } from '@app/ui';

export function useTour() {
  const { isActive, stopTour, tourStatus } = useTourStore();
  const { startOnborda, closeOnborda } = useOnborda();
  const updateStatus = useUpdateTourStatus();

  const handleStartTour = useCallback(() => {
    useTourStore.getState().startTour();
    startOnborda(TOUR_ID);
  }, [startOnborda]);

  const handleDismissTour = useCallback(() => {
    closeOnborda();
    stopTour();
    updateStatus.mutate('dismissed');
  }, [closeOnborda, stopTour, updateStatus]);

  const handleCompleteTour = useCallback(async () => {
    updateStatus.mutate('completed');
    closeOnborda();
    stopTour();

    try {
      const confettiModule = await import('canvas-confetti');
      confettiModule.default({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        zIndex: 9999,
      });
    } catch {
      // Confetti is non-critical — silently ignore
    }

    showSuccess("You're all set! That's the Assistant — AI by your side.");
  }, [closeOnborda, stopTour, updateStatus]);

  return {
    isActive,
    tourStatus,
    startTour: handleStartTour,
    dismissTour: handleDismissTour,
    completeTour: handleCompleteTour,
  };
}
