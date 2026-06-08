'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';

interface CountUpProps {
  to: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  className?: string;
}

export function CountUp({ to, prefix = '', suffix = '', duration = 2, className = '' }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!isInView) return;

    // Reduced-motion: jump straight to the final value, no tween.
    if (reduceMotion) {
      setDisplay(to.toLocaleString());
      return;
    }

    const startTime = performance.now();

    function easeOut(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    let frameId: number;
    function tick(now: number) {
      const elapsed = (now - startTime) / 1000;
      const progress = Math.min(elapsed / duration, 1);
      const value = Math.round(to * easeOut(progress));
      setDisplay(value.toLocaleString());

      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [isInView, to, duration, reduceMotion]);

  return (
    <motion.span
      ref={ref}
      initial={{ opacity: 0, filter: 'blur(10px)' }}
      animate={isInView ? { opacity: 1, filter: 'blur(0px)' } : {}}
      transition={{ duration: 0.6 }}
      className={className}
    >
      {prefix}
      {display}
      {suffix}
    </motion.span>
  );
}
