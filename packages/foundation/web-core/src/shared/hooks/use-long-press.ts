import { useRef, useCallback } from 'react';

interface UseLongPressOptions {
  /** Duration in ms before the long press fires (default: 800) */
  threshold?: number;
  /** Max finger movement in px before cancelling (default: 10) */
  moveThreshold?: number;
}

/**
 * Returns touch handlers that fire `onLongPress` after holding for `threshold` ms.
 * Normal taps are unaffected. Cancels if finger moves beyond `moveThreshold`.
 */
export function useLongPress(
  onLongPress: () => void,
  { threshold = 800, moveThreshold = 10 }: UseLongPressOptions = {},
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      firedRef.current = false;
      const touch = e.touches[0];
      startPos.current = { x: touch.clientX, y: touch.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        navigator.vibrate?.(50);
        onLongPress();
      }, threshold);
    },
    [onLongPress, threshold],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!startPos.current) return;
      const touch = e.touches[0];
      const dx = touch.clientX - startPos.current.x;
      const dy = touch.clientY - startPos.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
        clear();
      }
    },
    [clear, moveThreshold],
  );

  const onTouchEnd = useCallback(() => {
    clear();
    startPos.current = null;
  }, [clear]);

  const onClick = useCallback((e: React.MouseEvent) => {
    if (firedRef.current) {
      e.preventDefault();
      firedRef.current = false;
    }
  }, []);

  return { onTouchStart, onTouchMove, onTouchEnd, onClick };
}
