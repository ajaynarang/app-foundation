import { useEffect } from 'react';

interface UseDocumentViewerKeyboardOptions {
  enabled: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onRotateCW: () => void;
  onRotateCCW: () => void;
  canRotate: boolean;
}

/**
 * Keyboard shortcuts for the document viewer dialog.
 * Only active when the dialog is open (enabled = true).
 */
export function useDocumentViewerKeyboard({
  enabled,
  onPrevious,
  onNext,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onRotateCW,
  onRotateCCW,
  canRotate,
}: UseDocumentViewerKeyboardOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when user is typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          onPrevious();
          break;
        case 'ArrowRight':
          e.preventDefault();
          onNext();
          break;
        case '+':
        case '=':
          e.preventDefault();
          onZoomIn();
          break;
        case '-':
          e.preventDefault();
          onZoomOut();
          break;
        case '0':
          e.preventDefault();
          onZoomReset();
          break;
        case 'r':
        case 'R':
          if (canRotate) {
            e.preventDefault();
            if (e.shiftKey) {
              onRotateCCW();
            } else {
              onRotateCW();
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, onPrevious, onNext, onZoomIn, onZoomOut, onZoomReset, onRotateCW, onRotateCCW, canRotate]);
}
