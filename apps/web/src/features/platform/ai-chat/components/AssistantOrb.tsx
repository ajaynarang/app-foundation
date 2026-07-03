'use client';

import { motion, AnimatePresence, useReducedMotion, type Transition } from 'framer-motion';
import { useState } from 'react';
import type { OrbState } from '../engine/types';

interface AssistantOrbProps {
  state: OrbState;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
  hasUnread?: boolean;
  /** Show the `S` keyboard-shortcut hint below the orb on hover/focus when idle. */
  showHint?: boolean;
  /**
   * Keep the nerve net visible even at idle. Use for hero placements (home
   * orb) where the network IS the brand statement. The floating button and
   * inline decorations leave this off so idle reads as quiet chrome.
   */
  alwaysAmbient?: boolean;
}

const SIZE_MAP = {
  sm: { container: '2.8rem', half: '1.4rem', sixty: '1.7rem', seventy: '1.9rem', core: '1.6rem', icon: '1.0rem' },
  md: { container: '4.0rem', half: '2.0rem', sixty: '2.4rem', seventy: '2.8rem', core: '2.2rem', icon: '1.5rem' },
  lg: { container: '5.5rem', half: '2.8rem', sixty: '3.3rem', seventy: '3.9rem', core: '3.1rem', icon: '2.0rem' },
};

/**
 * Nerve-system inspired orb — SVG neural network with signal pulses,
 * radiating pulse rings, and organic morphing core.
 * Design language taken from the Assistant Nerve landing page.
 */

// Neural nodes arranged around the core (percentage-based SVG coords)
const NERVE_NODES = [
  { x: 50, y: 12 }, // top
  { x: 85, y: 28 }, // top-right
  { x: 92, y: 62 }, // right
  { x: 72, y: 88 }, // bottom-right
  { x: 28, y: 88 }, // bottom-left
  { x: 8, y: 62 }, // left
  { x: 15, y: 28 }, // top-left
];

// Edges connecting peripheral nodes to core (center at 50,50)
const NERVE_EDGES = NERVE_NODES.map((node) => ({
  from: node,
  to: { x: 50, y: 50 },
}));

// Cross-connections between adjacent peripheral nodes
const CROSS_EDGES = [
  { from: NERVE_NODES[0], to: NERVE_NODES[1] },
  { from: NERVE_NODES[1], to: NERVE_NODES[2] },
  { from: NERVE_NODES[2], to: NERVE_NODES[3] },
  { from: NERVE_NODES[3], to: NERVE_NODES[4] },
  { from: NERVE_NODES[4], to: NERVE_NODES[5] },
  { from: NERVE_NODES[5], to: NERVE_NODES[6] },
  { from: NERVE_NODES[6], to: NERVE_NODES[0] },
];

export function AssistantOrb({
  state,
  size = 'md',
  onClick,
  className = '',
  hasUnread = false,
  showHint = false,
  alwaysAmbient = false,
}: AssistantOrbProps) {
  const prefersReducedMotion = useReducedMotion();
  const s = SIZE_MAP[size];
  const [isEngaged, setIsEngaged] = useState(false);

  // Quiet at rest: hide the nerve net unless the orb is in an active state,
  // the user is hovering/focusing it, or the caller has opted into always-on
  // ambient (hero placements). Unread state has its own blue-ring treatment
  // and intentionally keeps the nerve net dark so the alert stays the focus.
  const isAmbientVisible = state !== 'idle' || isEngaged || alwaysAmbient;

  // Signal pulse speed varies by state
  const signalDuration = {
    idle: 4,
    listening: 1.5,
    thinking: 2,
    speaking: 2.5,
  }[state];

  // Node visibility/brightness by state. Idle nodes hide unless engaged or
  // the caller asks for always-on ambient (home orb).
  const idleAmbient = isEngaged || alwaysAmbient;
  const nodeOpacity = {
    idle: idleAmbient ? 0.45 : 0,
    listening: 0.9,
    thinking: 0.6,
    speaking: 0.75,
  }[state];

  const edgeOpacity = {
    idle: idleAmbient ? 0.22 : 0,
    listening: 0.5,
    thinking: 0.35,
    speaking: 0.45,
  }[state];

  // Core animation by state
  const coreAnimation = prefersReducedMotion
    ? { opacity: [0.8, 1, 0.8] }
    : {
        idle: { scale: [1, 1.08, 1] },
        listening: { scale: [1, 1.15, 1] },
        thinking: { scale: [1, 0.95, 1.05, 1], rotate: [0, -5, 5, 0] },
        speaking: { scale: [1, 1.12, 1] },
      }[state];

  const coreTransition = (
    {
      idle: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const },
      listening: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const },
      thinking: { duration: 1.8, repeat: Infinity, ease: 'easeInOut' as const },
      speaking: { duration: 1.4, repeat: Infinity, ease: 'easeOut' as const },
    } as const satisfies Record<OrbState, Transition>
  )[state];

  // Pulse ring count by state. Idle stays silent; engagement and unread are
  // handled by their own ring treatments below.
  const pulseRings = state === 'listening' ? 3 : state === 'speaking' ? 2 : 0;

  return (
    <button
      onClick={onClick}
      onPointerEnter={() => setIsEngaged(true)}
      onPointerLeave={() => setIsEngaged(false)}
      onFocus={() => setIsEngaged(true)}
      onBlur={() => setIsEngaged(false)}
      className={`relative flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-full cursor-pointer ${className}`}
      style={{ width: s.container, height: s.container }}
      aria-label={hasUnread ? 'Ask Assistant — new results available' : 'Ask Assistant'}
    >
      {/* Full SVG neural network */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {/* Cross-connection edges (peripheral ring) */}
        {CROSS_EDGES.map((edge, i) => (
          <g key={`cross-${i}`}>
            <motion.line
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              className="stroke-muted-foreground/40"
              strokeWidth={0.5}
              animate={{ opacity: edgeOpacity * 0.6 }}
              transition={{ duration: 0.4 }}
            />
            {/* Signal pulse on cross edges — only when active */}
            {state !== 'idle' && !prefersReducedMotion && (
              <motion.circle
                r={1.2}
                className="fill-muted-foreground/50"
                initial={{ cx: edge.from.x, cy: edge.from.y, opacity: 0 }}
                animate={{
                  cx: [edge.from.x, edge.to.x],
                  cy: [edge.from.y, edge.to.y],
                  opacity: [0, 0.6, 0],
                }}
                transition={{
                  duration: signalDuration * 1.2,
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: 'linear',
                }}
              />
            )}
          </g>
        ))}

        {/* Core-to-node edges (radial spokes) */}
        {NERVE_EDGES.map((edge, i) => (
          <g key={`edge-${i}`}>
            <motion.line
              x1={edge.from.x}
              y1={edge.from.y}
              x2={edge.to.x}
              y2={edge.to.y}
              className="stroke-muted-foreground/30"
              strokeWidth={0.8}
              animate={{ opacity: edgeOpacity }}
              transition={{ duration: 0.4 }}
            />
            {/* Signal dot traveling inward to core. Skip while quiet —
                an offscreen-opacity infinite animation still costs CPU. */}
            {isAmbientVisible && !prefersReducedMotion && (
              <motion.circle
                r={1.5}
                className="fill-muted-foreground/60"
                initial={{ cx: edge.from.x, cy: edge.from.y, opacity: 0 }}
                animate={{
                  cx: [edge.from.x, edge.to.x],
                  cy: [edge.from.y, edge.to.y],
                  opacity: [0, 0.8, 0],
                }}
                transition={{
                  duration: signalDuration,
                  repeat: Infinity,
                  delay: i * (signalDuration / NERVE_NODES.length),
                  ease: 'linear',
                }}
              />
            )}
          </g>
        ))}

        {/* Peripheral nerve nodes */}
        {NERVE_NODES.map((node, i) => (
          <motion.circle
            key={`node-${i}`}
            cx={node.x}
            cy={node.y}
            r={2.5}
            className="fill-muted-foreground/50"
            animate={{
              opacity: nodeOpacity,
              scale: state === 'listening' && !prefersReducedMotion ? [1, 1.4, 1] : 1,
            }}
            transition={{
              opacity: { duration: 0.4 },
              scale: { duration: 1.5, repeat: Infinity, delay: i * 0.2 },
            }}
          />
        ))}
      </svg>

      {/* Radiating pulse rings (like Pulse.tsx from landing page) */}
      {!prefersReducedMotion &&
        Array.from({ length: pulseRings }).map((_, i) => (
          <motion.div
            key={`pulse-${i}`}
            className="absolute rounded-full border border-border"
            style={{ width: s.half, height: s.half }}
            animate={{
              scale: [1, 2.5 + i * 0.3],
              opacity: [0.35, 0],
            }}
            transition={{
              duration: state === 'listening' ? 2 : 3,
              repeat: Infinity,
              delay: i * 0.7,
              ease: 'easeOut',
            }}
          />
        ))}

      {/* Listening glow (like landing page core pulse) */}
      {state === 'listening' && !prefersReducedMotion && (
        <motion.div
          className="absolute rounded-full"
          style={{ width: s.sixty, height: s.sixty }}
          animate={{
            boxShadow: [
              '0 0 8px rgba(120,120,120,0.15)',
              '0 0 24px rgba(120,120,120,0.4)',
              '0 0 8px rgba(120,120,120,0.15)',
            ],
          }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}

      {/* Unread async result pulse — blue ring when idle with pending results */}
      {hasUnread && state === 'idle' && !prefersReducedMotion && (
        <>
          <motion.div
            className="absolute rounded-full border-2 border-accent"
            style={{ width: s.seventy, height: s.seventy }}
            animate={{
              scale: [1, 2],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeOut',
            }}
          />
          <motion.div
            className="absolute rounded-full border-2 border-accent"
            style={{ width: s.seventy, height: s.seventy }}
            animate={{
              scale: [1, 2],
              opacity: [0.6, 0],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              delay: 0.75,
              ease: 'easeOut',
            }}
          />
        </>
      )}

      {/* Core orb — organic morphing shape inspired by sn-morph */}
      <motion.div
        className="absolute rounded-full bg-black dark:bg-white flex items-center justify-center shadow-lg"
        style={{
          width: s.core,
          height: s.core,
        }}
        animate={coreAnimation}
        transition={coreTransition}
      >
        {/* S icon — canonical brand logo mark */}
        <svg width={s.icon} height={s.icon} viewBox="0 0 200 200" fill="none">
          <path
            d="M 72 68 C 72 56, 84 48, 100 48 C 116 48, 128 56, 128 68 C 128 80, 116 86, 100 90 C 84 94, 72 100, 72 112 C 72 124, 84 132, 100 132 C 116 132, 128 124, 128 112"
            stroke="white"
            className="dark:stroke-black"
            strokeWidth="10"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </motion.div>

      {/* Keyboard-shortcut chip — Dock-style label that fades in above the
          orb on hover/focus while idle. Anchored above (not below) so the
          floating orb's bottom-of-viewport position never clips it. Shows
          the bare key (`S`) because that matches the binding in AssistantStrip.
          Hidden on touch via sm:. */}
      {showHint && (
        <AnimatePresence>
          {state === 'idle' && isEngaged && (
            <motion.div
              key="kbd-hint"
              initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 4 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="hidden sm:flex pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 items-center gap-1 px-2 py-0.5 text-2xs font-mono text-muted-foreground bg-background/90 backdrop-blur-sm rounded border border-border shadow-sm whitespace-nowrap"
              aria-hidden
            >
              <span>Press</span>
              <kbd className="font-mono">S</kbd>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </button>
  );
}
