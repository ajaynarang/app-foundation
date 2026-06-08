'use client';

import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

interface SignalSource {
  category: string;
  description: string;
  feeds: string[];
}

// Real integrations — sourced from the backend vendor registry
// (apps/backend/src/domains/integrations/vendor-registry.ts) and the
// platform-services external-data providers. No marketing filler.
const sources: SignalSource[] = [
  {
    category: 'ELD / Telematics',
    description: 'Real-time HOS, location, vehicle health',
    feeds: ['Samsara', 'Motive'],
  },
  {
    category: 'TMS & Billing',
    description: 'Load tracking, tenders, accounting, load board',
    feeds: ['project44', 'McLeod', 'TMW', 'QuickBooks', 'DAT'],
  },
  {
    category: 'External Data',
    description: 'Fuel prices, weather, traffic, mapping',
    feeds: ['GasBuddy', 'OpenWeather', 'HERE'],
  },
];

export function SignalSources() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  return (
    <div ref={ref} className="relative w-full max-w-4xl mx-auto">
      {/* Central SALLY node */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={isInView ? { opacity: 1, scale: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="flex justify-center mb-16"
      >
        <div className="relative">
          {/* Pulse rings */}
          {isInView &&
            [0, 1].map((i) => (
              <motion.div
                key={i}
                className="absolute inset-0 rounded-full border border-gray-200 dark:border-gray-800"
                animate={{ scale: [1, 2.5], opacity: [0.3, 0] }}
                transition={{ duration: 3, repeat: Infinity, delay: i * 1.5, ease: 'easeOut' }}
              />
            ))}
          <div className="w-16 h-16 rounded-full bg-foreground flex items-center justify-center">
            <span className="text-background text-xs font-bold tracking-wider">SALLY</span>
          </div>
        </div>
      </motion.div>

      {/* Signal lines fanning DOWN from the bottom of the SALLY node — short
          "nerve endings" that fade out well before the source labels, so no
          line reads as a stray vertical. The SVG starts at the circle's bottom
          edge (~40px = the 64px node centered in its row) so the convergence
          point sits under SALLY, never slicing through it. Lines run from the
          center (50,0) only ~60% of the way toward each column. */}
      <svg
        className="absolute left-0 w-full pointer-events-none"
        style={{ top: '40px', height: '80px' }}
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="nerveFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity={0.35} />
            <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {sources.map((_, i) => {
          const xPositions = [16.6, 50, 83.3];
          const x = xPositions[i];
          // Endpoint at ~60% of the way down — a fading stub, not a full connector.
          const endFraction = 0.6;
          const ex = 50 + (x - 50) * endFraction;
          const ey = 20 * endFraction;
          return (
            <g key={i} className="text-gray-300 dark:text-gray-700">
              {/* Static line — fades to transparent before the labels */}
              <motion.line
                x1={50}
                y1={0}
                x2={ex}
                y2={ey}
                stroke="url(#nerveFade)"
                strokeWidth={0.18}
                initial={{ pathLength: 0 }}
                animate={isInView ? { pathLength: 1 } : {}}
                transition={{ duration: 1, delay: 0.5 + i * 0.15 }}
              />
              {/* Signal dot traveling down the stub */}
              {isInView && (
                <motion.circle
                  r={0.4}
                  className="fill-gray-400 dark:fill-gray-500"
                  animate={{
                    cx: [50, ex],
                    cy: [0, ey],
                    opacity: [0.8, 0],
                  }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: 1.5 + i * 0.6,
                    ease: 'linear',
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>

      {/* Source cards */}
      <div className="grid md:grid-cols-3 gap-8 md:gap-6">
        {sources.map((source, i) => (
          <motion.div
            key={source.category}
            initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
            animate={isInView ? { opacity: 1, y: 0, filter: 'blur(0px)' } : {}}
            transition={{ duration: 0.7, delay: 0.4 + i * 0.15, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-center"
          >
            {/* Category */}
            <div className="text-2xs tracking-[0.3em] uppercase text-muted-foreground mb-3">{source.category}</div>

            {/* Description */}
            <p className="text-xs text-muted-foreground/70 mb-4">{source.description}</p>

            {/* Feed names as minimal pills */}
            <div className="flex flex-wrap justify-center gap-2">
              {source.feeds.map((feed, j) => (
                <motion.span
                  key={feed}
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: 1 } : {}}
                  transition={{ duration: 0.4, delay: 0.8 + i * 0.15 + j * 0.1 }}
                  className="text-2xs md:text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground"
                >
                  {feed}
                </motion.span>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
