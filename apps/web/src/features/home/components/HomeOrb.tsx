'use client';

import { useRef, useCallback } from 'react';
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion';
import { SallyOrb } from '@/features/platform/sally-ai/components/SallyOrb';
import { useSallyStore } from '@/features/platform/sally-ai';
import type { OrbState } from '@/features/platform/sally-ai';

interface HomeOrbProps {
  /** Override the orb state from the Sally store */
  state?: OrbState;
  onClick?: () => void;
  className?: string;
}

/**
 * HomeOrb wraps SallyOrb at large size with an ambient glow effect
 * that subtly pulses behind the orb. The glow reacts magnetically
 * to cursor proximity — the orb "knows" you're there.
 */
export function HomeOrb({ state, onClick, className = '' }: HomeOrbProps) {
  const storeOrbState = useSallyStore((s) => s.orbState);
  const orbState = state ?? storeOrbState;
  const containerRef = useRef<HTMLDivElement>(null);

  // Raw mouse offset from center of orb (-1 to 1 range)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Springy follow — orb glow lags behind cursor for organic feel
  const glowX = useSpring(mouseX, { stiffness: 150, damping: 20 });
  const glowY = useSpring(mouseY, { stiffness: 150, damping: 20 });

  // Map normalized offset to pixel shift (max ±8px)
  const translateX = useTransform(glowX, [-1, 1], [-8, 8]);
  const translateY = useTransform(glowY, [-1, 1], [-8, 8]);

  // Map distance from center to glow intensity
  const glowOpacity = useTransform([glowX, glowY], ([x, y]: number[]) => {
    const dist = Math.sqrt(x * x + y * y);
    // Closer to center = stronger glow (0.12 → 0.20)
    return 0.12 + (1 - Math.min(dist, 1)) * 0.08;
  });
  const springOpacity = useSpring(glowOpacity, { stiffness: 100, damping: 25 });

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Normalized offset: -1 to 1 within a 200px radius
      const radius = 200;
      const nx = Math.max(-1, Math.min(1, (e.clientX - centerX) / radius));
      const ny = Math.max(-1, Math.min(1, (e.clientY - centerY) / radius));

      mouseX.set(nx);
      mouseY.set(ny);
    },
    [mouseX, mouseY],
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative flex items-center justify-center ${className}`}
      // Generous hit area so the magnetic effect starts before reaching the orb
      style={{ padding: '2rem', margin: '-2rem' }}
    >
      {/* Ambient glow — follows cursor magnetically */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: '6rem',
          height: '6rem',
          x: translateX,
          y: translateY,
        }}
        animate={{
          boxShadow: [
            '0 0 40px 10px rgba(120,120,120,0.06)',
            '0 0 60px 20px rgba(120,120,120,0.12)',
            '0 0 40px 10px rgba(120,120,120,0.06)',
          ],
        }}
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      <SallyOrb state={orbState} size="lg" onClick={onClick} alwaysAmbient />
    </div>
  );
}
