/**
 * SALLY Motion System — Centralized Animation Configuration
 *
 * Design philosophy: "Quiet Confidence"
 * - Functional, not decorative — every animation communicates state change
 * - Fast and non-blocking — 150-300ms for interactions
 * - Consistent rhythm — same easing, same durations everywhere
 * - Reduced motion first — graceful degradation built-in
 *
 * Three layers:
 *   L1 Micro    — Tailwind `transition-*` (button press, hover, focus)
 *   L2 Component — Framer Motion variants (sheet open, list stagger, tab switch)
 *   L3 Page     — Framer Motion AnimatePresence (route transitions)
 */

// ── Duration Scale (seconds) ────────────────────────────────────────────────
export const duration = {
  /** 100ms — instant feedback (active states, toggles) */
  instant: 0.1,
  /** 150ms — micro interactions (button press, checkbox) */
  micro: 0.15,
  /** 200ms — fast transitions (hover, focus, small reveals) */
  fast: 0.2,
  /** 300ms — standard transitions (sheets, modals, page enter) */
  normal: 0.3,
  /** 400ms — deliberate transitions (layout shifts, complex reveals) */
  moderate: 0.4,
  /** 500ms — slow transitions (page-level, dramatic reveals) */
  slow: 0.5,
} as const;

// ── Easing Curves ───────────────────────────────────────────────────────────
// Matched to Apple HIG / Material Design 3 motion principles
export const easing = {
  /** Standard ease-out — most UI transitions (enter, reveal) */
  out: [0.22, 1, 0.36, 1] as const,
  /** Ease-in — exit animations (elements leaving) */
  in: [0.4, 0, 1, 1] as const,
  /** Ease-in-out — symmetric transitions (layout shifts, morphs) */
  inOut: [0.65, 0, 0.35, 1] as const,
  /** Emphasized — high-impact entrance (page transitions, hero reveals) */
  emphasized: [0.2, 0, 0, 1] as const,
} as const;

// ── Spring Presets ──────────────────────────────────────────────────────────
export const spring = {
  /** Snappy — buttons, toggles, small interactive elements */
  snappy: { type: 'spring' as const, stiffness: 400, damping: 30 },
  /** Gentle — sheets, panels, modals */
  gentle: { type: 'spring' as const, stiffness: 260, damping: 25 },
  /** Bouncy — celebratory moments, success states (use sparingly) */
  bouncy: { type: 'spring' as const, stiffness: 300, damping: 15 },
} as const;

// ── Stagger Timing ──────────────────────────────────────────────────────────
export const stagger = {
  /** 30ms — fast lists (table rows, menu items) */
  fast: 0.03,
  /** 50ms — standard lists (cards, grid items) */
  normal: 0.05,
  /** 80ms — deliberate sequences (onboarding steps, feature reveals) */
  slow: 0.08,
} as const;

// ── Transition Presets (Framer Motion `transition` prop) ────────────────────
export const transition = {
  /** Fast tween — hover states, small reveals */
  fast: { duration: duration.fast, ease: easing.out },
  /** Standard tween — most component animations */
  normal: { duration: duration.normal, ease: easing.out },
  /** Page enter — route transitions */
  page: { duration: duration.moderate, ease: easing.emphasized },
  /** Layout shift — sidebar collapse, panel resize */
  layout: { duration: duration.normal, ease: easing.inOut },
} as const;

// ── Transform Distance (pixels) ────────────────────────────────────────────
export const distance = {
  /** 4px — micro shift (subtle feedback) */
  micro: 4,
  /** 8px — small movement (list items, fade-up) */
  small: 8,
  /** 16px — standard movement (page enter, sheet content) */
  medium: 16,
  /** 24px — large movement (page transitions) */
  large: 24,
} as const;
