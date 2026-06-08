'use client';

import { motion } from 'framer-motion';
import { useRef } from 'react';

interface Stop {
  x: number;
  y: number;
  type: 'start' | 'delivery' | 'rest' | 'fuel' | 'end';
  label?: string;
}

export function PlanAnimation() {
  const pathRef = useRef<SVGPathElement>(null);

  // Simplified route with key stops
  const stops: Stop[] = [
    { x: 50, y: 100, type: 'start', label: 'Start' },
    { x: 120, y: 80, type: 'delivery' },
    { x: 190, y: 100, type: 'rest', label: 'Rest' },
    { x: 260, y: 80, type: 'fuel', label: 'Fuel' },
    { x: 330, y: 100, type: 'end', label: 'End' },
  ];

  // Generate smooth curved path
  const pathData = stops.reduce((path, stop, i) => {
    if (i === 0) return `M ${stop.x} ${stop.y}`;
    const prevStop = stops[i - 1];
    const midX = (prevStop.x + stop.x) / 2;
    return `${path} Q ${midX} ${prevStop.y}, ${stop.x} ${stop.y}`;
  }, '');

  const getStopIcon = (type: Stop['type']) => {
    switch (type) {
      case 'start':
        return (
          <circle
            cx="0"
            cy="0"
            r="8"
            className="fill-black dark:fill-white stroke-white dark:stroke-black"
            strokeWidth="2"
          />
        );
      case 'end':
        return (
          <>
            <circle
              cx="0"
              cy="0"
              r="8"
              className="fill-black dark:fill-white stroke-white dark:stroke-black"
              strokeWidth="2"
            />
            <circle cx="0" cy="0" r="3" className="fill-white dark:fill-black" />
          </>
        );
      case 'delivery':
        return (
          <rect
            x="-6"
            y="-6"
            width="12"
            height="12"
            className="fill-black dark:fill-white stroke-white dark:stroke-black"
            strokeWidth="2"
          />
        );
      case 'rest':
        return (
          <>
            <circle
              cx="0"
              cy="0"
              r="8"
              className="fill-gray-600 dark:fill-gray-400 stroke-white dark:stroke-black"
              strokeWidth="2"
            />
            <path d="M -4 0 L 4 0 M 0 -4 L 0 4" className="stroke-white dark:stroke-black" strokeWidth="2" />
          </>
        );
      case 'fuel':
        return (
          <>
            <circle
              cx="0"
              cy="0"
              r="8"
              className="fill-gray-500 dark:fill-gray-500 stroke-white dark:stroke-black"
              strokeWidth="2"
            />
            <circle cx="0" cy="0" r="2" className="fill-white dark:fill-black" />
          </>
        );
    }
  };

  return (
    <div className="w-full h-48 flex items-center justify-center bg-muted/30 dark:bg-muted/20 rounded-lg">
      <svg viewBox="0 0 380 150" className="w-full h-full" style={{ maxWidth: '400px' }}>
        {/* Background grid */}
        <defs>
          <pattern id="plan-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path
              d="M 20 0 L 0 0 0 20"
              fill="none"
              className="stroke-gray-200 dark:stroke-gray-700"
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="380" height="150" fill="url(#plan-grid)" />

        {/* Animated route path */}
        <motion.path
          ref={pathRef}
          d={pathData}
          fill="none"
          className="stroke-gray-400 dark:stroke-gray-600"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="500"
          initial={{ strokeDashoffset: 500 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{
            duration: 3,
            ease: 'easeInOut',
            repeat: Infinity,
            repeatDelay: 2,
          }}
        />

        {/* Stops */}
        {stops.map((stop, index) => (
          <motion.g
            key={index}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: (index / stops.length) * 2.5 + 0.5,
              duration: 0.4,
              type: 'spring',
              stiffness: 200,
              repeat: Infinity,
              repeatDelay: 2,
            }}
          >
            <g transform={`translate(${stop.x}, ${stop.y})`}>
              {getStopIcon(stop.type)}
              {stop.label && (
                <>
                  <rect
                    x="-20"
                    y="14"
                    width="40"
                    height="16"
                    className="fill-background stroke-border"
                    strokeWidth="1"
                    rx="3"
                  />
                  <text y="25" textAnchor="middle" className="text-2xs font-semibold fill-foreground">
                    {stop.label}
                  </text>
                </>
              )}
            </g>
          </motion.g>
        ))}
      </svg>
    </div>
  );
}
