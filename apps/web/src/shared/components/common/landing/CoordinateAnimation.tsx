'use client';

import { motion } from 'framer-motion';

export function CoordinateAnimation() {
  return (
    <div className="w-full h-48 flex items-center justify-center bg-muted/30 dark:bg-muted/20 rounded-lg">
      <svg viewBox="0 0 380 150" className="w-full h-full" style={{ maxWidth: '400px' }}>
        {/* Dispatcher side (left) */}
        <g>
          {/* Dashboard panel */}
          <rect
            x="20"
            y="30"
            width="140"
            height="90"
            className="fill-background stroke-border"
            strokeWidth="2"
            rx="6"
          />

          {/* Dashboard icon */}
          <rect x="35" y="45" width="110" height="8" className="fill-muted" rx="2" />
          <rect x="35" y="60" width="80" height="8" className="fill-muted" rx="2" />

          {/* Alert notification appearing */}
          <motion.g
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.5,
              delay: 1,
              repeat: Infinity,
              repeatDelay: 4,
            }}
          >
            <rect x="45" y="80" width="90" height="24" className="fill-yellow-500 dark:fill-yellow-600" rx="4" />
            <text x="90" y="96" textAnchor="middle" className="text-2xs font-bold fill-black">
              HOS Alert
            </text>
          </motion.g>

          {/* Label */}
          <text x="90" y="140" textAnchor="middle" className="text-[11px] font-semibold fill-foreground">
            Dispatcher
          </text>
        </g>

        {/* Connection arrow */}
        <motion.g
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{
            duration: 0.8,
            delay: 1.8,
            repeat: Infinity,
            repeatDelay: 4,
          }}
        >
          <motion.path
            d="M 170 75 L 210 75"
            className="stroke-blue-500 dark:stroke-blue-400"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <motion.path
            d="M 205 70 L 210 75 L 205 80"
            className="stroke-blue-500 dark:stroke-blue-400"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </motion.g>

        {/* Driver side (right) */}
        <g>
          {/* Phone/app panel */}
          <rect
            x="220"
            y="30"
            width="140"
            height="90"
            className="fill-background stroke-border"
            strokeWidth="2"
            rx="6"
          />

          {/* App icon */}
          <rect x="235" y="45" width="110" height="8" className="fill-muted" rx="2" />

          {/* Update notification appearing */}
          <motion.g
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              duration: 0.4,
              delay: 2.6,
              repeat: Infinity,
              repeatDelay: 4,
              type: 'spring',
              stiffness: 200,
            }}
          >
            <rect x="245" y="65" width="90" height="40" className="fill-green-500 dark:fill-green-600" rx="4" />
            <text x="290" y="82" textAnchor="middle" className="text-[9px] font-bold fill-white">
              Route Update
            </text>
            <text x="290" y="96" textAnchor="middle" className="text-[8px] font-medium fill-white">
              Rest at Exit 47
            </text>
          </motion.g>

          {/* Label */}
          <text x="290" y="140" textAnchor="middle" className="text-[11px] font-semibold fill-foreground">
            Driver
          </text>
        </g>
      </svg>
    </div>
  );
}
