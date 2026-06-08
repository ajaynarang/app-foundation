'use client';

import { motion, useMotionValue, useSpring } from 'framer-motion';
import { useEffect, useMemo } from 'react';

interface AmbientCanvasProps {
  temperature?: 'neutral' | 'warm' | 'cool';
  intensity?: number;
  className?: string;
}

export function AmbientCanvas({ temperature = 'neutral', intensity = 1, className = '' }: AmbientCanvasProps) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { stiffness: 20, damping: 40 });
  const springY = useSpring(mouseY, { stiffness: 20, damping: 40 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      mouseX.set((e.clientX - centerX) * 0.02);
      mouseY.set((e.clientY - centerY) * 0.02);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${(i * 37 + 13) % 100}%`,
      top: `${(i * 53 + 7) % 100}%`,
      size: 1 + (i % 3),
      delay: i * 0.5,
      duration: 6 + (i % 5) * 2,
    }));
  }, []);

  const lightColors = {
    neutral: ['rgba(220,218,215,0.4)', 'rgba(210,208,205,0.3)', 'rgba(225,223,220,0.35)'],
    warm: ['rgba(240,232,228,0.5)', 'rgba(232,228,224,0.4)', 'rgba(235,225,218,0.45)'],
    cool: ['rgba(215,220,230,0.4)', 'rgba(208,215,228,0.35)', 'rgba(220,225,235,0.3)'],
  };
  const darkColors = {
    neutral: ['rgba(30,30,40,0.6)', 'rgba(25,25,35,0.5)', 'rgba(35,35,45,0.55)'],
    warm: ['rgba(40,30,28,0.5)', 'rgba(35,28,25,0.4)', 'rgba(45,35,30,0.45)'],
    cool: ['rgba(22,28,50,0.6)', 'rgba(18,24,45,0.5)', 'rgba(26,32,55,0.55)'],
  };

  const blobs = [
    {
      cls: 'sc-blob-1',
      w: '60vw',
      mw: '800px',
      left: '-10%',
      top: '-10%',
      right: undefined,
      bottom: undefined,
      opMul: 0.8,
    },
    {
      cls: 'sc-blob-2',
      w: '50vw',
      mw: '700px',
      left: undefined,
      top: '30%',
      right: '-5%',
      bottom: undefined,
      opMul: 0.6,
    },
    {
      cls: 'sc-blob-3',
      w: '55vw',
      mw: '750px',
      left: '20%',
      top: undefined,
      right: undefined,
      bottom: '-20%',
      opMul: 0.5,
    },
  ];

  return (
    <div className={`absolute inset-0 overflow-hidden pointer-events-none ${className}`}>
      {/* SVG Noise Filter */}
      <svg className="absolute w-0 h-0">
        <defs>
          <filter id="sc-noise-filter">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
        </defs>
      </svg>

      {/* Noise overlay */}
      <div className="sc-noise" style={{ filter: 'url(#sc-noise-filter)' }} />

      {/* Gradient blobs - light mode versions */}
      {blobs.map((blob, i) => (
        <motion.div
          key={`light-${i}`}
          className={`sc-blob ${blob.cls} dark:!hidden`}
          style={{
            width: blob.w,
            height: blob.w,
            maxWidth: blob.mw,
            maxHeight: blob.mw,
            left: blob.left,
            top: blob.top,
            right: blob.right,
            bottom: blob.bottom,
            background: `radial-gradient(circle, ${lightColors[temperature][i]}, transparent 70%)`,
            opacity: intensity * blob.opMul,
            x: springX,
            y: springY,
          }}
        />
      ))}

      {/* Gradient blobs - dark mode versions */}
      {blobs.map((blob, i) => (
        <motion.div
          key={`dark-${i}`}
          className={`sc-blob ${blob.cls} hidden dark:!block`}
          style={{
            width: blob.w,
            height: blob.w,
            maxWidth: blob.mw,
            maxHeight: blob.mw,
            left: blob.left,
            top: blob.top,
            right: blob.right,
            bottom: blob.bottom,
            background: `radial-gradient(circle, ${darkColors[temperature][i]}, transparent 70%)`,
            opacity: intensity * blob.opMul,
            x: springX,
            y: springY,
          }}
        />
      ))}

      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="sc-particle bg-gray-400 dark:bg-gray-600"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            opacity: 0.3,
          }}
        />
      ))}
    </div>
  );
}
