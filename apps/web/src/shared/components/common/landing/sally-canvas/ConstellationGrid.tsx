'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useState, useMemo } from 'react';

interface TriggerNode {
  id: string;
  name: string;
  category: 'proactive' | 'reactive' | 'external' | 'operational' | 'compliance';
  description: string;
}

const triggers: TriggerNode[] = [
  {
    id: 'hos-approaching',
    name: 'HOS Approaching',
    category: 'proactive',
    description: 'Driver approaching hours of service limits within 2 hours',
  },
  {
    id: 'hos-violation',
    name: 'HOS Violation',
    category: 'reactive',
    description: 'Driver has exceeded hours of service limits',
  },
  {
    id: 'not-moving',
    name: 'Not Moving',
    category: 'reactive',
    description: 'Driver has not moved for 15+ minutes when scheduled',
  },
  {
    id: 'dock-delay',
    name: 'Dock Delay',
    category: 'operational',
    description: 'Loading/unloading taking longer than estimated',
  },
  { id: 'weather', name: 'Weather', category: 'external', description: 'Severe weather conditions along route' },
  { id: 'traffic', name: 'Traffic', category: 'external', description: 'Significant traffic delays (>30 min)' },
  {
    id: 'fuel-low',
    name: 'Fuel Low',
    category: 'operational',
    description: 'Fuel level below threshold before next stop',
  },
  {
    id: 'rest-skipped',
    name: 'Rest Skipped',
    category: 'compliance',
    description: 'Driver skipped a planned rest stop',
  },
  {
    id: 'route-deviation',
    name: 'Deviation',
    category: 'operational',
    description: 'Driver deviated from planned route',
  },
  { id: 'eta-change', name: 'ETA Change', category: 'operational', description: 'ETA changed by more than 1 hour' },
  {
    id: 'customer-req',
    name: 'Customer',
    category: 'external',
    description: 'Customer requested delivery time change',
  },
  {
    id: 'vehicle-issue',
    name: 'Vehicle',
    category: 'reactive',
    description: 'Vehicle malfunction or maintenance alert',
  },
  {
    id: 'appointment',
    name: 'Appointment',
    category: 'proactive',
    description: 'At risk of missing scheduled appointment',
  },
  { id: 'break-compliance', name: 'Break', category: 'compliance', description: 'Break requirements not being met' },
];

// Connections between related triggers (indices)
const connections: [number, number][] = [
  [0, 1], // HOS Approaching → HOS Violation
  [0, 7], // HOS Approaching → Rest Skipped
  [1, 13], // HOS Violation → Break
  [2, 8], // Not Moving → Deviation
  [3, 9], // Dock Delay → ETA Change
  [4, 5], // Weather → Traffic
  [6, 8], // Fuel Low → Deviation
  [7, 13], // Rest Skipped → Break
  [9, 12], // ETA Change → Appointment
  [10, 9], // Customer → ETA Change
  [11, 2], // Vehicle → Not Moving
  [3, 12], // Dock Delay → Appointment
];

export function ConstellationGrid() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  // Generate node positions in a roughly circular/organic layout
  // Using deterministic positions that look good
  const nodePositions = useMemo(() => {
    const positions: { x: number; y: number }[] = [];
    const cols = 5;
    const rows = 3;

    for (let i = 0; i < triggers.length; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      // Add some organic offset
      const offsetX = ((i * 17 + 5) % 20) - 10;
      const offsetY = ((i * 13 + 7) % 16) - 8;

      positions.push({
        x: (col / (cols - 1)) * 80 + 10 + offsetX * 0.3,
        y: (row / (rows - 1)) * 70 + 15 + offsetY * 0.3,
      });
    }
    // Adjust last row (only 4 items) to center
    if (positions.length > 10) {
      const lastRowStart = 10;
      const lastRowCount = positions.length - lastRowStart;
      for (let i = lastRowStart; i < positions.length; i++) {
        const idx = i - lastRowStart;
        positions[i].x = ((idx + 0.5) / lastRowCount) * 60 + 20;
      }
    }
    return positions;
  }, []);

  const hoveredIndex = hoveredNode ? triggers.findIndex((t) => t.id === hoveredNode) : -1;

  return (
    <div ref={ref} className="relative w-full max-w-4xl mx-auto" style={{ aspectRatio: '16/9' }}>
      {/* SVG for connection lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {connections.map(([from, to], i) => {
          const fromPos = nodePositions[from];
          const toPos = nodePositions[to];
          if (!fromPos || !toPos) return null;

          const isHighlighted = hoveredIndex === from || hoveredIndex === to;

          return (
            <motion.line
              key={`line-${i}`}
              x1={fromPos.x}
              y1={fromPos.y}
              x2={toPos.x}
              y2={toPos.y}
              className={
                isHighlighted ? 'stroke-gray-400 dark:stroke-gray-500' : 'stroke-gray-200 dark:stroke-gray-800'
              }
              strokeWidth={isHighlighted ? 0.3 : 0.15}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={isInView ? { pathLength: 1, opacity: isHighlighted ? 0.8 : 0.4 } : {}}
              transition={{
                pathLength: { duration: 1.5, delay: 0.5 + i * 0.08, ease: 'easeInOut' },
                opacity: { duration: 0.3 },
              }}
            />
          );
        })}
      </svg>

      {/* Nodes */}
      {triggers.map((trigger, i) => {
        const pos = nodePositions[i];
        if (!pos) return null;

        const isHovered = hoveredNode === trigger.id;
        const isConnected =
          hoveredIndex >= 0 &&
          connections.some(([from, to]) => (from === hoveredIndex && to === i) || (to === hoveredIndex && from === i));

        return (
          <motion.div
            key={trigger.id}
            className="absolute"
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            initial={{ opacity: 0, scale: 0 }}
            animate={isInView ? { opacity: 1, scale: 1 } : {}}
            transition={{
              duration: 0.5,
              delay: 0.3 + i * 0.06,
              type: 'spring',
              stiffness: 200,
              damping: 15,
            }}
            onHoverStart={() => setHoveredNode(trigger.id)}
            onHoverEnd={() => setHoveredNode(null)}
          >
            {/* Node dot */}
            <motion.div
              className={`relative cursor-pointer ${isHovered || isConnected ? 'z-20' : 'z-10'}`}
              animate={{
                scale: isHovered ? 1.4 : isConnected ? 1.2 : 1,
              }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              {/* Pulse ring */}
              <motion.div
                className="absolute inset-0 rounded-full bg-gray-400 dark:bg-gray-500"
                style={{ width: 12, height: 12, margin: 'auto', inset: 0 }}
                animate={{
                  scale: [1, 2, 1],
                  opacity: [0.3, 0, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: i * 0.2,
                }}
              />

              {/* Core dot */}
              <div
                className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                  isHovered
                    ? 'bg-foreground'
                    : isConnected
                      ? 'bg-gray-500 dark:bg-gray-400'
                      : 'bg-gray-300 dark:bg-gray-600'
                }`}
              />

              {/* Label */}
              <motion.div
                initial={false}
                animate={{
                  opacity: isHovered || isConnected ? 1 : 0,
                  y: isHovered || isConnected ? 0 : 5,
                  filter: isHovered || isConnected ? 'blur(0px)' : 'blur(4px)',
                }}
                transition={{ duration: 0.2 }}
                className="absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap"
              >
                <span className="text-2xs md:text-xs font-medium text-foreground">{trigger.name}</span>
              </motion.div>

              {/* Tooltip on hover */}
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-48 p-3 bg-background border border-border rounded-lg shadow-lg z-30"
                >
                  <div className="text-xs font-semibold text-foreground mb-1">{trigger.name}</div>
                  <div className="text-2xs text-muted-foreground leading-relaxed">{trigger.description}</div>
                  <div className="text-[9px] text-muted-foreground mt-1.5 uppercase tracking-wider">
                    {trigger.category}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </motion.div>
        );
      })}

      {/* Stats floating around constellation */}
      <motion.div
        className="absolute bottom-0 left-0 right-0 flex justify-center gap-6 md:gap-12 text-center"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 1.5 }}
      >
        {[
          { value: '14', label: 'vectors' },
          { value: '60s', label: 'intervals' },
          { value: '24/7', label: 'coverage' },
        ].map((stat) => (
          <div key={stat.label} className="text-muted-foreground">
            <span className="text-xs md:text-sm font-light tracking-widest">{stat.value}</span>
            <span className="text-2xs ml-1 opacity-60">{stat.label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}
