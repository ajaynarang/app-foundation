'use client';

import { useRef, useCallback } from 'react';

export function useAlertSound() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playAlertSound = useCallback((priority: string) => {
    // Only play for critical and high priority
    if (priority !== 'critical' && priority !== 'high') return;

    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('/sounds/alert-critical.mp3');
        audioRef.current.volume = 0.5;
      }

      // Reset and play
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {
        // Browser may block autoplay — user interaction required first
      });
    } catch {
      // Audio not available
    }
  }, []);

  return { playAlertSound };
}
