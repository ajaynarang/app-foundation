'use client';

import { motion } from 'framer-motion';

export function MonitorAnimation() {
  // Simplified dashboard with routes and status indicators
  const routes = [
    { id: 1, y: 30, status: 'on-track', delay: 0 },
    { id: 2, y: 60, status: 'alert', delay: 0.5 },
    { id: 3, y: 90, status: 'on-track', delay: 1 },
    { id: 4, y: 120, status: 'on-track', delay: 1.5 },
  ];

  const triggers = [
    { x: 280, y: 40, delay: 1.2 },
    { x: 320, y: 70, delay: 1.8 },
    { x: 300, y: 100, delay: 2.4 },
  ];

  return (
    <div className="w-full h-48 flex items-center justify-center bg-muted/30 dark:bg-muted/20 rounded-lg">
      <svg viewBox="0 0 380 150" className="w-full h-full" style={{ maxWidth: '400px' }}>
        {/* Dashboard background */}
        <rect width="360" height="140" x="10" y="5" className="fill-background stroke-border" strokeWidth="2" rx="8" />

        {/* Route bars */}
        {routes.map((route) => (
          <g key={route.id}>
            {/* Route label */}
            <text x="25" y={route.y + 5} className="text-[11px] font-semibold fill-muted-foreground">
              Route #{route.id}
            </text>

            {/* Status bar background */}
            <rect x="100" y={route.y - 8} width="200" height="16" className="fill-muted" rx="4" />

            {/* Animated progress bar */}
            <motion.rect
              x="100"
              y={route.y - 8}
              width="200"
              height="16"
              className={
                route.status === 'alert' ? 'fill-yellow-500 dark:fill-yellow-600' : 'fill-green-500 dark:fill-green-600'
              }
              rx="4"
              initial={{ width: 0 }}
              animate={{ width: 200 * (route.id === 2 ? 0.65 : 0.8) }}
              transition={{
                duration: 2,
                delay: route.delay,
                ease: 'easeInOut',
                repeat: Infinity,
                repeatDelay: 2,
              }}
            />

            {/* Status indicator */}
            <motion.circle
              cx="320"
              cy={route.y}
              r="5"
              className={
                route.status === 'alert' ? 'fill-yellow-500 dark:fill-yellow-600' : 'fill-green-500 dark:fill-green-600'
              }
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{
                duration: 0.5,
                delay: route.delay + 1.5,
                repeat: Infinity,
                repeatDelay: 3,
              }}
            />
          </g>
        ))}

        {/* Trigger detection indicators (pulsing dots) */}
        {triggers.map((trigger, i) => (
          <motion.g key={i}>
            {/* Outer pulse */}
            <motion.circle
              cx={trigger.x}
              cy={trigger.y}
              r="8"
              className="fill-none stroke-blue-500 dark:stroke-blue-400"
              strokeWidth="2"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 2, 1],
                opacity: [0.6, 0, 0.6],
              }}
              transition={{
                duration: 2,
                delay: trigger.delay,
                repeat: Infinity,
                ease: 'easeOut',
              }}
            />
            {/* Center dot */}
            <motion.circle
              cx={trigger.x}
              cy={trigger.y}
              r="3"
              className="fill-blue-500 dark:fill-blue-400"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                duration: 0.3,
                delay: trigger.delay,
                repeat: Infinity,
                repeatDelay: 2,
              }}
            />
          </motion.g>
        ))}

        {/* "14 Triggers" label */}
        <motion.text
          x="340"
          y="140"
          textAnchor="end"
          className="text-2xs font-semibold fill-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 0.5, repeat: Infinity, repeatDelay: 3 }}
        >
          14 Triggers
        </motion.text>
      </svg>
    </div>
  );
}
