'use client';

import * as React from 'react';
import { useState, useCallback, useRef, useContext, createContext } from 'react';
import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { Pin, PinOff, X } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import { useIsDesktop } from '@/shared/hooks/use-is-mobile';
import { Button } from '@/shared/components/ui/button';
import { STORAGE_KEYS } from '@/shared/constants';

// -- Constants for resizable sheets --
const MIN_SHEET_WIDTH = 380;
const DEFAULT_SHEET_WIDTH = 512;
const LS_KEY_PINNED = STORAGE_KEYS.SHEET_PINNED;
const LS_KEY_WIDTH = STORAGE_KEYS.SHEET_RESIZE_WIDTH;

// -- Context: pin/resize state flows from SheetContent → SheetHeader → children --
interface SheetPinContextValue {
  isPinned: boolean;
  togglePin: () => void;
  canPin: boolean;
  /** Imperatively set the sheet width (px). Used by sizing preset buttons. */
  setWidth: (px: number) => void;
}
const SheetPinContext = createContext<SheetPinContextValue>({
  isPinned: false,
  togglePin: () => {},
  canPin: false,
  setWidth: () => {},
});

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      'fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  'fixed z-50 bg-background shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom:
          'inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-full border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm',
        right:
          'inset-y-0 right-0 h-full w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, VariantProps<typeof sheetVariants> {
  /** Show pin/unpin toggle button (desktop only). Default: false */
  pinnable?: boolean;
  /** Enable drag-to-resize width (desktop only, right/left sides only). Default: false */
  resizable?: boolean;
  /** Initial pinned state. Defaults to last user preference from localStorage. */
  defaultPinned?: boolean;
  /** Override default resize width in pixels (e.g. from sizing presets). */
  defaultWidth?: number;
}

/**
 * SheetContent — container only. Does NOT render close/pin buttons.
 * Those are rendered by SheetHeader, which every sheet must include.
 */
const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  (
    {
      side = 'right',
      className,
      children,
      pinnable = false,
      resizable = false,
      defaultPinned,
      defaultWidth,
      onInteractOutside,
      onPointerDownOutside,
      ...props
    },
    ref,
  ) => {
    const isDesktop = useIsDesktop();
    const canPin = pinnable && isDesktop;
    const canResize = resizable && isDesktop && (side === 'right' || side === 'left');

    // Pin state — persisted to localStorage
    const [isPinned, setIsPinned] = useState(() => {
      if (defaultPinned !== undefined) return defaultPinned;
      if (typeof window === 'undefined') return false;
      return localStorage.getItem(LS_KEY_PINNED) === 'true';
    });

    // Resize state — same pointer events pattern as SallyStrip
    const [sheetWidth, setSheetWidth] = useState(() => {
      if (defaultWidth) return Math.max(MIN_SHEET_WIDTH, defaultWidth);
      if (typeof window === 'undefined') return DEFAULT_SHEET_WIDTH;
      const stored = localStorage.getItem(LS_KEY_WIDTH);
      return stored ? Math.max(MIN_SHEET_WIDTH, parseInt(stored, 10)) : DEFAULT_SHEET_WIDTH;
    });
    // Sync width when defaultWidth prop changes (e.g. from size control buttons)
    React.useEffect(() => {
      if (defaultWidth && !isDragging) {
        setSheetWidth(Math.max(MIN_SHEET_WIDTH, defaultWidth));
      }
    }, [defaultWidth]); // eslint-disable-line react-hooks/exhaustive-deps

    const [isDragging, setIsDragging] = useState(false);
    const dragStartXRef = useRef(0);
    const dragStartWidthRef = useRef(DEFAULT_SHEET_WIDTH);

    const togglePin = useCallback(() => {
      setIsPinned((prev) => {
        const next = !prev;
        localStorage.setItem(LS_KEY_PINNED, String(next));
        return next;
      });
    }, []);

    const handleDragStart = useCallback(
      (e: React.PointerEvent) => {
        if (!canResize) return;
        e.preventDefault();
        setIsDragging(true);
        dragStartXRef.current = e.clientX;
        dragStartWidthRef.current = sheetWidth;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      },
      [canResize, sheetWidth],
    );

    const handleDragMove = useCallback(
      (e: React.PointerEvent) => {
        if (!isDragging) return;
        const maxWidth = Math.floor(window.innerWidth / 2);
        const delta = side === 'right' ? dragStartXRef.current - e.clientX : e.clientX - dragStartXRef.current;
        const newWidth = Math.min(maxWidth, Math.max(MIN_SHEET_WIDTH, dragStartWidthRef.current + delta));
        setSheetWidth(newWidth);
      },
      [isDragging, side],
    );

    const handleDragEnd = useCallback(() => {
      if (!isDragging) return;
      setIsDragging(false);
      setSheetWidth((current) => {
        localStorage.setItem(LS_KEY_WIDTH, String(current));
        return current;
      });
    }, [isDragging]);

    /** Imperative width setter — called by sizing preset buttons */
    const setWidthImperative = useCallback((px: number) => {
      const clamped = Math.max(MIN_SHEET_WIDTH, px);
      setSheetWidth(clamped);
      localStorage.setItem(LS_KEY_WIDTH, String(clamped));
    }, []);

    const overlayHidden = canPin && isPinned;

    const resolvedInteractOutside = canPin && isPinned ? (e: Event) => e.preventDefault() : onInteractOutside;
    const resolvedPointerDownOutside = canPin && isPinned ? (e: Event) => e.preventDefault() : onPointerDownOutside;

    const resizeStyle: React.CSSProperties | undefined = canResize
      ? {
          width: `min(${sheetWidth}px, 100vw)`,
          transition: isDragging ? 'none' : 'width 200ms ease-in-out',
        }
      : undefined;
    const resizableOverrideClass = canResize ? 'sm:!max-w-none' : '';

    const pinContextValue = React.useMemo(
      () => ({ isPinned, togglePin, canPin, setWidth: setWidthImperative }),
      [isPinned, togglePin, canPin, setWidthImperative],
    );

    return (
      <SheetPinContext.Provider value={pinContextValue}>
        <SheetPortal>
          <SheetOverlay className={cn(overlayHidden && '!bg-transparent pointer-events-none')} />
          <SheetPrimitive.Content
            ref={ref}
            className={cn(
              sheetVariants({ side }),
              'p-6',
              resizableOverrideClass,
              isDragging && 'select-none',
              className,
            )}
            style={resizeStyle}
            onInteractOutside={resolvedInteractOutside}
            onPointerDownOutside={resolvedPointerDownOutside}
            {...props}
          >
            {/* Drag handle — edge of sheet, desktop only */}
            {canResize && (
              <div
                onPointerDown={handleDragStart}
                onPointerMove={handleDragMove}
                onPointerUp={handleDragEnd}
                onPointerCancel={handleDragEnd}
                className={cn(
                  'hidden sm:block absolute top-0 bottom-0 w-1.5 cursor-col-resize z-10 group/drag hover:bg-primary/10 active:bg-primary/20',
                  side === 'right' ? 'left-0' : 'right-0',
                )}
              >
                <div
                  className={cn(
                    'absolute top-1/2 -translate-y-1/2 w-0.5 h-8 rounded-full bg-border group-hover/drag:bg-muted-foreground transition-colors',
                    side === 'right' ? 'left-0.5' : 'right-0.5',
                  )}
                />
              </div>
            )}

            {children}
          </SheetPrimitive.Content>
        </SheetPortal>
      </SheetPinContext.Provider>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

// ─── SheetHeader ─────────────────────────────────────────────────────
// Smart toolbar: always renders close button, optionally pin button,
// and accepts user actions (Edit, Deactivate, etc.) via `actions` prop.
//
// Layout:
// ┌──────────────────────────────────────────────────┐
// │  [children: title+badges]  [actions] [pin] [X]   │
// └──────────────────────────────────────────────────┘

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Action buttons (Edit, Deactivate, etc.) placed before pin/close */
  actions?: React.ReactNode;
  /** Make header sticky with border-bottom and background */
  sticky?: boolean;
}

const SheetHeader = ({ className, children, actions, sticky, ...props }: SheetHeaderProps) => {
  const { canPin, isPinned, togglePin } = useContext(SheetPinContext);

  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 text-left',
        sticky && 'sticky top-0 z-10 bg-background border-b border-border px-6 py-4',
        className,
      )}
      {...props}
    >
      {/* Left side: title, badges, description — stacked */}
      <div className="flex flex-col space-y-1.5 min-w-0 flex-1">{children}</div>

      {/* Right side: actions + pin + close — inline */}
      <div className="flex items-center gap-1 shrink-0">
        {actions}
        {canPin && (
          <Button
            variant="ghost"
            size="icon"
            onClick={togglePin}
            className="h-8 w-8 opacity-70 hover:opacity-100"
            aria-label={isPinned ? 'Unpin sheet — click outside to close' : 'Pin sheet — stay open on outside click'}
            title={isPinned ? 'Unpin — click outside to close' : 'Pin — stay open on outside click'}
          >
            {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </Button>
        )}
        <SheetPrimitive.Close asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 opacity-70 hover:opacity-100">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </Button>
        </SheetPrimitive.Close>
      </div>
    </div>
  );
};
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

/** Access sheet context (pin, resize) from children inside SheetContent */
export function useSheetContext() {
  return useContext(SheetPinContext);
}

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
};
