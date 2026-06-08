'use client';

import { motion } from 'framer-motion';

/**
 * SignalFlicker — ghostly data fragments that appear and dissolve
 * across the hero background, representing fleet signals going unheard.
 *
 * Used ONLY on the landing hero. Login/register use HeroRouteBackground alone.
 */

interface Signal {
  text: string;
  x: number; // percentage
  y: number; // percentage
  delay: number;
  duration: number;
}

const signals: Signal[] = [
  { text: 'HOS: 4.2h remaining', x: 12, y: 22, delay: 2, duration: 6 },
  { text: 'ETA: 14:32 CST', x: 78, y: 18, delay: 4, duration: 6 },
  { text: 'Fuel: 47%', x: 65, y: 72, delay: 3, duration: 6 },
  { text: 'Dock B — 90 min delay', x: 18, y: 68, delay: 5, duration: 6 },
  { text: '38.9°N 94.6°W', x: 42, y: 82, delay: 6, duration: 6 },
  { text: 'Wind: 23 mph gusts', x: 85, y: 45, delay: 7, duration: 6 },
  { text: 'Driver 14 — 10h break due', x: 28, y: 38, delay: 8, duration: 6 },
  { text: '$3.42/gal — Exit 47', x: 72, y: 55, delay: 4.5, duration: 6 },
  { text: 'Route 7 — recalculating', x: 55, y: 28, delay: 9, duration: 6 },
  { text: 'Violation risk: 22 min', x: 8, y: 48, delay: 10, duration: 6 },
];

export function SignalFlicker() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-[1]">
      {signals.map((signal, i) => (
        <motion.span
          key={i}
          className="absolute font-mono text-xs md:text-sm text-muted-foreground select-none whitespace-nowrap"
          style={{ left: `${signal.x}%`, top: `${signal.y}%` }}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.6, 0.6, 0.6, 0],
          }}
          transition={{
            duration: signal.duration,
            times: [0, 0.1, 0.5, 0.9, 1],
            delay: signal.delay,
            repeat: Infinity,
            repeatDelay: 3 + (i % 3),
            ease: 'easeInOut',
          }}
        >
          {signal.text}
        </motion.span>
      ))}
    </div>
  );
}
