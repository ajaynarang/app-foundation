'use client';

import { useMemo } from 'react';

/**
 * Converts a 0-1 audio level into an array of bar heights for waveform visualization.
 * Returns heights for `barCount` bars, with natural variation.
 */
export function useAudioVisualizer(audioLevel: number, barCount: number = 8): number[] {
  return useMemo(() => {
    if (audioLevel === 0) {
      return Array(barCount).fill(3);
    }

    return Array.from({ length: barCount }, (_, i) => {
      const phase = (i / barCount) * Math.PI * 2;
      const variation = Math.sin(phase + Date.now() / 200) * 0.3 + 0.7;
      const height = 3 + audioLevel * 25 * variation;
      return Math.max(3, Math.min(28, height));
    });
  }, [audioLevel, barCount]);
}
