'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useMemo } from 'react';

/**
 * An abstract neural network visualization — nodes and synapses
 * representing SALLY's monitoring intelligence.
 * Renders as SVG with animated connection lines.
 */

interface Node {
  id: string;
  label: string;
  x: number;
  y: number;
}

const nodes: Node[] = [
  { id: 'core', label: 'SALLY', x: 50, y: 50 },
  { id: 'hos', label: 'HOS', x: 20, y: 25 },
  { id: 'fuel', label: 'Fuel', x: 80, y: 20 },
  { id: 'weather', label: 'Weather', x: 15, y: 65 },
  { id: 'traffic', label: 'Traffic', x: 85, y: 60 },
  { id: 'dock', label: 'Docks', x: 35, y: 15 },
  { id: 'vehicle', label: 'Vehicle', x: 65, y: 15 },
  { id: 'driver', label: 'Driver', x: 25, y: 80 },
  { id: 'dispatch', label: 'Dispatch', x: 75, y: 80 },
  { id: 'route', label: 'Route', x: 50, y: 85 },
  { id: 'eta', label: 'ETA', x: 10, y: 45 },
  { id: 'compliance', label: 'Compliance', x: 90, y: 42 },
];

// All outer nodes connect to core; some connect to each other
const edges: [string, string][] = [
  ['core', 'hos'],
  ['core', 'fuel'],
  ['core', 'weather'],
  ['core', 'traffic'],
  ['core', 'dock'],
  ['core', 'vehicle'],
  ['core', 'driver'],
  ['core', 'dispatch'],
  ['core', 'route'],
  ['core', 'eta'],
  ['core', 'compliance'],
  ['hos', 'driver'],
  ['hos', 'compliance'],
  ['fuel', 'route'],
  ['weather', 'traffic'],
  ['dock', 'eta'],
  ['driver', 'dispatch'],
  ['vehicle', 'driver'],
  ['route', 'eta'],
];

export function NervousSystem() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });

  const nodeMap = useMemo(() => {
    const map: Record<string, Node> = {};
    nodes.forEach((n) => {
      map[n.id] = n;
    });
    return map;
  }, []);

  return (
    <div ref={ref} className="relative w-full max-w-3xl mx-auto" style={{ aspectRatio: '1/1' }}>
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
        {/* Edges */}
        {edges.map(([fromId, toId], i) => {
          const from = nodeMap[fromId];
          const to = nodeMap[toId];
          if (!from || !to) return null;

          return (
            <g key={`edge-${i}`}>
              <motion.line
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="stroke-gray-200 dark:stroke-gray-800"
                strokeWidth={fromId === 'core' || toId === 'core' ? 0.2 : 0.1}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={isInView ? { pathLength: 1, opacity: 0.5 } : {}}
                transition={{ duration: 1, delay: 0.3 + i * 0.05, ease: 'easeInOut' }}
              />
              {/* Signal pulse traveling along the edge */}
              {isInView && (
                <motion.circle
                  r={0.4}
                  className="fill-gray-400 dark:fill-gray-500"
                  initial={{ opacity: 0 }}
                  animate={{
                    cx: [from.x, to.x],
                    cy: [from.y, to.y],
                    opacity: [0, 0.8, 0],
                  }}
                  transition={{
                    duration: 2 + (i % 3),
                    repeat: Infinity,
                    delay: 2 + i * 0.3,
                    ease: 'linear',
                  }}
                />
              )}
            </g>
          );
        })}

        {/* Nodes */}
        {nodes.map((node, i) => {
          const isCore = node.id === 'core';
          return (
            <g key={node.id}>
              {/* Pulse ring for core */}
              {isCore && isInView && (
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={3}
                  fill="none"
                  className="stroke-gray-300 dark:stroke-gray-600"
                  strokeWidth={0.15}
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: [1, 3], opacity: [0.4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeOut' }}
                />
              )}
              <motion.circle
                cx={node.x}
                cy={node.y}
                r={isCore ? 2.5 : 1}
                className={isCore ? 'fill-gray-800 dark:fill-gray-200' : 'fill-gray-300 dark:fill-gray-600'}
                initial={{ scale: 0, opacity: 0 }}
                animate={isInView ? { scale: 1, opacity: 1 } : {}}
                transition={{
                  duration: 0.4,
                  delay: 0.2 + i * 0.06,
                  type: 'spring',
                  stiffness: 200,
                }}
              />
              <motion.text
                x={node.x}
                y={node.y + (isCore ? 5 : 3)}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: isCore ? 2.5 : 1.8 }}
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 0.7 } : {}}
                transition={{ duration: 0.4, delay: 0.6 + i * 0.05 }}
              >
                {node.label}
              </motion.text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
