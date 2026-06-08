'use client';

import { motion, useAnimation } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface Stop {
  x: number;
  y: number;
  type: 'origin' | 'delivery' | 'rest' | 'fuel' | 'destination';
  label?: string;
}

export function AnimatedRoute() {
  const pathRef = useRef<SVGPathElement>(null);
  const dotControls = useAnimation();

  // Define route path with stops
  const stops: Stop[] = [
    { x: 80, y: 300, type: 'origin', label: 'Start' },
    { x: 220, y: 200, type: 'delivery' },
    { x: 380, y: 250, type: 'rest', label: 'Rest' },
    { x: 520, y: 180, type: 'fuel', label: 'Fuel' },
    { x: 640, y: 220, type: 'delivery' },
    { x: 720, y: 160, type: 'destination', label: 'End' },
  ];

  // Generate smooth path
  const pathData = stops.reduce((path, stop, i) => {
    if (i === 0) return `M ${stop.x} ${stop.y}`;
    const prevStop = stops[i - 1];
    const midX = (prevStop.x + stop.x) / 2;
    return `${path} Q ${midX} ${prevStop.y}, ${stop.x} ${stop.y}`;
  }, '');

  useEffect(() => {
    let isMounted = true;

    // Animate the traveling dot along the path
    const animateDot = async () => {
      if (!pathRef.current || !isMounted) return;

      const pathLength = pathRef.current.getTotalLength();

      // Infinite loop animation with mount check
      while (isMounted && pathRef.current) {
        for (let i = 0; i <= 100; i++) {
          // Check if still mounted and ref exists before each animation step
          if (!isMounted || !pathRef.current) return;

          const point = pathRef.current.getPointAtLength((pathLength * i) / 100);
          await dotControls.start({
            cx: point.x,
            cy: point.y,
            transition: { duration: 0.03, ease: 'linear' },
          });
        }
        // Pause before repeating
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    };

    // Start animation after path is drawn
    const timeout = setTimeout(() => {
      animateDot();
    }, 3000);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, [dotControls]);

  const getStopIcon = (type: Stop['type']) => {
    switch (type) {
      case 'origin':
        return (
          <>
            <circle cx="0" cy="0" r="10" fill="#000" stroke="#fff" strokeWidth="3" />
            <circle cx="0" cy="0" r="4" fill="#fff" />
          </>
        );
      case 'destination':
        return (
          <>
            <circle cx="0" cy="0" r="10" fill="#000" stroke="#fff" strokeWidth="3" />
            <path d="M -4 0 L 0 -5 L 4 0 L 0 5 Z" fill="#fff" />
          </>
        );
      case 'delivery':
        return (
          <>
            <rect x="-8" y="-8" width="16" height="16" fill="#000" stroke="#fff" strokeWidth="3" />
            <rect x="-3" y="-3" width="6" height="6" fill="#fff" />
          </>
        );
      case 'rest':
        return (
          <>
            <circle cx="0" cy="0" r="10" fill="#525252" stroke="#fff" strokeWidth="3" />
            <path d="M -4 0 L 4 0 M 0 -4 L 0 4" stroke="#fff" strokeWidth="2" />
          </>
        );
      case 'fuel':
        return (
          <>
            <circle cx="0" cy="0" r="10" fill="#737373" stroke="#fff" strokeWidth="3" />
            <circle cx="0" cy="0" r="3" fill="#fff" />
          </>
        );
    }
  };

  return (
    <div className="w-full h-[400px] flex items-center justify-center bg-gray-50/50 rounded-lg">
      <svg viewBox="0 0 800 400" className="w-full h-full" style={{ maxWidth: '800px' }}>
        {/* Background grid for context */}
        <defs>
          <pattern id="route-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e5e5" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="800" height="400" fill="url(#route-grid)" />

        {/* Animated route path */}
        <motion.path
          ref={pathRef}
          id="route-path"
          d={pathData}
          fill="none"
          stroke="#a3a3a3"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="1000"
          initial={{ strokeDashoffset: 1000 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{
            duration: 3,
            ease: 'easeInOut',
          }}
        />

        {/* Stops with improved visibility */}
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
            }}
          >
            <g transform={`translate(${stop.x}, ${stop.y})`}>
              {getStopIcon(stop.type)}
              {stop.label && (
                <>
                  {/* Label background for readability */}
                  <rect x="-25" y="18" width="50" height="20" fill="#fff" stroke="#d4d4d4" strokeWidth="1" rx="4" />
                  <text y="32" textAnchor="middle" className="text-xs font-semibold" fill="#171717">
                    {stop.label}
                  </text>
                </>
              )}
            </g>
          </motion.g>
        ))}

        {/* Animated dot following the path */}
        <motion.circle
          animate={dotControls}
          initial={{ cx: stops[0].x, cy: stops[0].y }}
          r="6"
          fill="#000"
          stroke="#fff"
          strokeWidth="2"
        />
      </svg>
    </div>
  );
}

// Enhanced hero background with multiple animated routes
export function HeroRouteBackground() {
  // Generate multiple route paths for a network effect
  const routes = [
    {
      d: 'M 0 400 Q 200 300, 400 400 T 800 350 Q 1000 300, 1200 400',
      delay: 0,
      duration: 6,
    },
    {
      d: 'M 100 200 Q 300 100, 600 250 T 1100 200',
      delay: 1,
      duration: 7,
    },
    {
      d: 'M 0 600 Q 250 500, 500 550 T 900 600 Q 1100 650, 1200 550',
      delay: 2,
      duration: 8,
    },
    {
      d: 'M 200 100 Q 400 50, 700 150 T 1200 100',
      delay: 1.5,
      duration: 7.5,
    },
    {
      d: 'M 0 300 Q 300 250, 600 300 T 1200 250',
      delay: 0.5,
      duration: 6.5,
    },
  ];

  // Node positions for the network
  const nodes = [
    { x: 200, y: 300, delay: 0.5 },
    { x: 400, y: 150, delay: 1 },
    { x: 600, y: 400, delay: 1.5 },
    { x: 800, y: 250, delay: 2 },
    { x: 1000, y: 500, delay: 2.5 },
    { x: 300, y: 600, delay: 1.2 },
    { x: 900, y: 150, delay: 1.8 },
    { x: 500, y: 550, delay: 1.3 },
  ];

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <svg viewBox="0 0 1200 800" className="w-full h-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          {/* Fine grid pattern - Light mode */}
          <pattern id="hero-grid-light" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#e5e5e5" strokeWidth="0.5" />
          </pattern>

          {/* Fine grid pattern - Dark mode */}
          <pattern id="hero-grid-dark" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#404040" strokeWidth="0.5" />
          </pattern>

          {/* Gradient for routes - Light mode */}
          <linearGradient id="route-gradient-light" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.02" />
            <stop offset="50%" stopColor="#000" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#000" stopOpacity="0.02" />
          </linearGradient>

          {/* Gradient for routes - Dark mode */}
          <linearGradient id="route-gradient-dark" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="50%" stopColor="#fff" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Grid background - Light mode */}
        <rect width="100%" height="100%" fill="url(#hero-grid-light)" opacity="0.3" className="dark:hidden" />

        {/* Grid background - Dark mode */}
        <rect width="100%" height="100%" fill="url(#hero-grid-dark)" opacity="0.4" className="hidden dark:block" />

        {/* Multiple animated route paths - Light mode */}
        {routes.map((route, index) => (
          <motion.path
            key={`route-light-${index}`}
            d={route.d}
            fill="none"
            stroke="url(#route-gradient-light)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="1200"
            initial={{ strokeDashoffset: 1200 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{
              duration: route.duration,
              delay: route.delay,
              ease: 'easeInOut',
              repeat: Infinity,
              repeatDelay: 3,
            }}
            className="dark:hidden"
          />
        ))}

        {/* Multiple animated route paths - Dark mode */}
        {routes.map((route, index) => (
          <motion.path
            key={`route-dark-${index}`}
            d={route.d}
            fill="none"
            stroke="url(#route-gradient-dark)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="1200"
            initial={{ strokeDashoffset: 1200 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{
              duration: route.duration,
              delay: route.delay,
              ease: 'easeInOut',
              repeat: Infinity,
              repeatDelay: 3,
            }}
            className="hidden dark:block"
          />
        ))}

        {/* Network nodes - Light mode */}
        {nodes.map((node, index) => (
          <motion.g key={`node-light-${index}`} className="dark:hidden">
            {/* Pulse ring */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="4"
              fill="none"
              stroke="#000"
              strokeWidth="1"
              opacity="0.1"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 2.5, 1],
                opacity: [0.1, 0, 0.1],
              }}
              transition={{
                duration: 3,
                delay: node.delay,
                repeat: Infinity,
                ease: 'easeOut',
              }}
            />
            {/* Node center */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="3"
              fill="#000"
              opacity="0.15"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                duration: 0.3,
                delay: node.delay,
                type: 'spring',
              }}
            />
          </motion.g>
        ))}

        {/* Network nodes - Dark mode */}
        {nodes.map((node, index) => (
          <motion.g key={`node-dark-${index}`} className="hidden dark:block">
            {/* Pulse ring */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="4"
              fill="none"
              stroke="#fff"
              strokeWidth="1"
              opacity="0.15"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 2.5, 1],
                opacity: [0.15, 0, 0.15],
              }}
              transition={{
                duration: 3,
                delay: node.delay,
                repeat: Infinity,
                ease: 'easeOut',
              }}
            />
            {/* Node center */}
            <motion.circle
              cx={node.x}
              cy={node.y}
              r="3"
              fill="#fff"
              opacity="0.2"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{
                duration: 0.3,
                delay: node.delay,
                type: 'spring',
              }}
            />
          </motion.g>
        ))}

        {/* Traveling dots on routes for extra dynamism - Light mode */}
        {[0, 2, 4].map((routeIndex) => (
          <motion.circle
            key={`dot-light-${routeIndex}`}
            r="3"
            fill="#000"
            opacity="0.2"
            className="dark:hidden"
            initial={{ offsetDistance: '0%', scale: 0 }}
            animate={{
              offsetDistance: '100%',
              scale: [0, 1, 1, 0],
            }}
            transition={{
              duration: routes[routeIndex].duration,
              delay: routes[routeIndex].delay + 1,
              ease: 'linear',
              repeat: Infinity,
              repeatDelay: 3,
            }}
            style={{
              offsetPath: `path('${routes[routeIndex].d}')`,
            }}
          />
        ))}

        {/* Traveling dots on routes for extra dynamism - Dark mode */}
        {[0, 2, 4].map((routeIndex) => (
          <motion.circle
            key={`dot-dark-${routeIndex}`}
            r="3"
            fill="#fff"
            opacity="0.3"
            className="hidden dark:block"
            initial={{ offsetDistance: '0%', scale: 0 }}
            animate={{
              offsetDistance: '100%',
              scale: [0, 1, 1, 0],
            }}
            transition={{
              duration: routes[routeIndex].duration,
              delay: routes[routeIndex].delay + 1,
              ease: 'linear',
              repeat: Infinity,
              repeatDelay: 3,
            }}
            style={{
              offsetPath: `path('${routes[routeIndex].d}')`,
            }}
          />
        ))}
      </svg>
    </div>
  );
}
