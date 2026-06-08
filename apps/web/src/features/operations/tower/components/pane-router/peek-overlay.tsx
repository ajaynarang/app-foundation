'use client';

interface PeekOverlayProps {
  children: React.ReactNode;
}

/**
 * Transient wire overlay shown while `3` is held down at <1100px. It floats
 * over the right pane and disappears the instant the key is released, so the
 * dispatcher can glance at the wire without losing their current pair.
 */
export function PeekOverlay({ children }: PeekOverlayProps) {
  return (
    <div
      role="region"
      aria-label="Wire (peek)"
      className="absolute inset-y-0 right-0 z-30 w-[min(360px,60%)] border-l border-border bg-background shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-150"
    >
      {children}
    </div>
  );
}
