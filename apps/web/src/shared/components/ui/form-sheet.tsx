'use client';

import * as React from 'react';
import { useEffect, useCallback } from 'react';
import { Check } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/shared/components/ui/sheet';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';

type SheetMode = 'view' | 'edit';

interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /**
   * Optional rich title content. When provided, renders inside the SheetTitle
   * in place of the plain `title` string. The `title` prop is still required
   * and used as the accessible label for screen readers (pass a descriptive
   * plain string). Use this when you want an avatar, badge, or icon strip
   * in the header bar — e.g. the Desk agent sheet.
   */
  titleNode?: React.ReactNode;
  description?: string;
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
  /** Entity type key for sheet sizing controls. When provided, shows ◧ ◨ □ controls in header. */
  entityType?: string;
  /** Action buttons placed before pin/close in header */
  headerActions?: React.ReactNode;
}

/** Default width for FormSheets without entityType (utility sheets). */
const DEFAULT_WIDTH_CLASS = 'w-full sm:max-w-lg';

// On mobile, sheets are full-screen so we need flex layout for sticky footer
const mobileLayoutClass = 'flex flex-col h-full';

/**
 * Keyboard hint shown in edit-mode sheets to indicate Esc/X closes, Cmd+Enter saves.
 * Use inside any manually-constructed Sheet header (sheets not using FormSheet).
 */
export function SheetKeyboardHint({ showSave = true }: { showSave?: boolean }) {
  return (
    <p className="text-xs text-muted-foreground mt-2">
      Press <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-2xs font-mono">Esc</kbd> or{' '}
      <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-2xs font-mono">✕</kbd> to close
      {showSave && (
        <>
          {' '}
          · <kbd className="px-1 py-0.5 rounded border border-border bg-muted text-2xs font-mono">⌘↵</kbd> to save
        </>
      )}
    </p>
  );
}

export function FormSheet({
  open,
  onOpenChange,
  title,
  titleNode,
  description,
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
  entityType,
  headerActions,
}: FormSheetProps) {
  // Default pinnable: true for edit mode, false for view
  const effectivePinnable = pinnable ?? mode === 'edit';
  // When entityType is provided, default to resizable so size controls work
  const effectiveResizable = resizable || !!entityType;
  const contentRef = React.useRef<HTMLDivElement>(null);

  // Sheet sizing: when entityType is provided, use the persisted size preference
  const sizing = useSheetSizing(entityType ?? '');

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
        className={cn(effectiveResizable ? 'w-full' : DEFAULT_WIDTH_CLASS, mobileLayoutClass, 'p-6')}
        onInteractOutside={mode === 'edit' ? (e) => e.preventDefault() : undefined}
        onKeyDown={handleKeyDown}
        pinnable={effectivePinnable}
        resizable={effectiveResizable}
        defaultPinned={mode === 'edit'}
        {...(entityType ? { defaultWidth: sizeModeToPixels(sizing.effectiveSize) } : {})}
      >
        <SheetHeader
          className="flex-shrink-0"
          actions={
            <div className="flex items-center gap-1">
              {headerActions}
              {entityType && sizing.showControls && <SheetSizeControls entityType={entityType} />}
            </div>
          }
        >
          <SheetTitle aria-label={title}>{titleNode ?? title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        {mode === 'edit' && (
          <div className="flex-shrink-0">
            <SheetKeyboardHint showSave={!!onSubmit} />
          </div>
        )}

        <div className="mt-6 flex-1 overflow-y-auto min-h-0 px-0.5 -mx-0.5">{children}</div>

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
