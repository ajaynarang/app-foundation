'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef, ReactNode } from 'react';

/**
 * Text that flows in from atmospheric blur — like words
 * emerging from fog. Supports children as ReactNode for
 * mixed content (spans, etc.)
 *
 * Honors prefers-reduced-motion: motion-sensitive users get a
 * plain fade with no blur/translate.
 */
interface FlowTextProps {
  children: ReactNode;
  as?: 'h1' | 'h2' | 'h3' | 'p' | 'span' | 'div';
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'none';
}

export function FlowText({ children, as: Tag = 'div', className = '', delay = 0, direction = 'up' }: FlowTextProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();

  const yOffset = direction === 'up' ? 30 : direction === 'down' ? -30 : 0;

  const initial = reduceMotion ? { opacity: 0 } : { opacity: 0, y: yOffset, filter: 'blur(12px)' };
  const animate = isInView ? (reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }) : {};

  return (
    <motion.div
      ref={ref}
      initial={initial}
      animate={animate}
      transition={{ duration: 0.9, delay, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <Tag className={className}>{children}</Tag>
    </motion.div>
  );
}

/**
 * Staggered flow — each child line appears sequentially.
 * Lines accept ReactNode so callers can pass richer rows
 * (e.g. a bold lead with a muted trailing cost).
 */
export function FlowStagger({
  lines,
  className = '',
  lineClassName = '',
  stagger = 0.15,
  delay = 0,
}: {
  lines: ReactNode[];
  className?: string;
  lineClassName?: string;
  stagger?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();

  return (
    <div ref={ref} className={className}>
      {lines.map((line, i) => (
        <motion.div
          key={i}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={isInView ? (reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, filter: 'blur(0px)' }) : {}}
          transition={{
            duration: 0.7,
            delay: delay + i * stagger,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className={lineClassName}
        >
          {line}
        </motion.div>
      ))}
    </div>
  );
}
