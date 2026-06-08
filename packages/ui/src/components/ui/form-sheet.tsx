'use client';

import * as React from 'react';
import { useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './sheet';
import { Button } from './button';
import { cn } from '../../lib/utils';

type SheetSize = 'sm' | 'md';
type SheetMode = 'view' | 'edit';

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: SheetSize;
  mode?: SheetMode;
  children: React.ReactNode;
  /** Edit mode footer props */
  onSubmit?: () => void;
  onCancel?: () => void;
  submitLabel?: string;
  cancelLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  /** Show brief success checkmark before closing */
  showSuccess?: boolean;
  /** Additional footer content (e.g. extra buttons) */
  footerExtra?: React.ReactNode;
  /** Side of sheet */
  side?: 'right' | 'left';
  /** Enable pin/unpin toggle (desktop only). Defaults to true for edit mode, false for view. */
  pinnable?: boolean;
  /** Enable drag-to-resize (desktop only). Default: false */
  resizable?: boolean;
}

const sizeClasses: Record<SheetSize, string> = {
  sm: 'w-full sm:max-w-lg',
  md: 'w-full sm:max-w-2xl',
};

// On mobile, sheets are full-screen so we need flex layout for sticky footer
const mobileLayoutClass = 'flex flex-col h-full';

/**
 * Keyboard hint shown in edit-mode sheets to indicate Esc/X closes, Cmd+Enter saves.
 * Use inside any manually-constructed Sheet header (sheets not using FormSheet).
 */
export function SheetKeyboardHint({ showSave = true }: { showSave?: boolean }) {
  return (
    <p className="text-xs text-muted-foreground mt-2">
      Press <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">Esc</kbd> or{' '}
      <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">✕</kbd> to close
      {showSave && (
        <>
          {' '}
          · <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-[10px] font-mono">⌘↵</kbd> to save
        </>
      )}
    </p>
  );
}

export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  size = 'sm',
  mode = 'edit',
  children,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isSubmitting = false,
  submitDisabled = false,
  showSuccess = false,
  footerExtra,
  side = 'right',
  pinnable,
  resizable = false,
}: FormSheetProps) {
  // Default pinnable: true for edit mode, false for view
  const effectivePinnable = pinnable ?? mode === 'edit';
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Auto-focus first input when sheet opens
  useEffect(() => {
    if (open && mode === 'edit') {
      const timer = setTimeout(() => {
        const firstInput = contentRef.current?.querySelector<HTMLElement>(
          'input:not([type="hidden"]), textarea, select, [tabindex="0"]',
        );
        firstInput?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [open, mode]);

  // Cmd+Enter / Ctrl+Enter to submit
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mode === 'edit' && onSubmit && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (!isSubmitting && !submitDisabled) {
          onSubmit();
        }
      }
    },
    [mode, onSubmit, isSubmitting, submitDisabled],
  );

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        ref={contentRef}
        side={side}
        className={cn(resizable ? '' : sizeClasses[size], mobileLayoutClass, 'p-6')}
        onInteractOutside={mode === 'edit' ? (e) => e.preventDefault() : undefined}
        onKeyDown={handleKeyDown}
        pinnable={effectivePinnable}
        resizable={resizable}
        defaultPinned={mode === 'edit'}
      >
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {mode === 'edit' && (
          <div className="flex-shrink-0">
            <SheetKeyboardHint showSave={!!onSubmit} />
          </div>
        )}

        <div className="mt-6 flex-1 overflow-y-auto min-h-0">{children}</div>

        {/* Sticky footer for edit mode */}
        {mode === 'edit' && onSubmit && (
          <div className="flex items-center gap-2 pt-4 flex-shrink-0 border-t border-border mt-4 safe-area-bottom">
            {footerExtra}
            <div className="flex-1" />
            <Button variant="outline" onClick={handleCancel} disabled={isSubmitting}>
              {cancelLabel}
            </Button>
            <Button onClick={onSubmit} disabled={submitDisabled} loading={isSubmitting && !showSuccess}>
              {showSuccess ? <Check className="h-4 w-4" /> : submitLabel}
            </Button>
          </div>
        )}

        {/* View mode: action footer if footerExtra provided */}
        {mode === 'view' && footerExtra && (
          <div className="flex flex-wrap items-center gap-2 pt-4 flex-shrink-0 border-t border-border mt-4 safe-area-bottom">
            {footerExtra}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
