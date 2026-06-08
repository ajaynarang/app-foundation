'use client';

import { forwardRef, type ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { fadeIn, slideUp, scaleIn, pageEnter, staggerContainer, staggerItem } from './variants';
import { stagger } from './config';

// ── PageTransition ──────────────────────────────────────────────────────────
// Wrap page content for enter-only animations on route change.
// mode="sync" ensures no exit delay — new page enters immediately.

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  /** Unique key per page — typically `pathname` */
  pageKey: string;
}

export function PageTransition({ children, className, pageKey }: PageTransitionProps) {
  const reducedMotion = useReducedMotion();

  if (reducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <AnimatePresence mode="sync">
      <motion.div key={pageKey} variants={pageEnter} initial="hidden" animate="visible" className={className}>
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

// ── FadeIn ──────────────────────────────────────────────────────────────────
// Simple fade wrapper for lazy-loaded sections, cards, panels.

interface FadeInProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
}

export const FadeIn = forwardRef<HTMLDivElement, FadeInProps>(({ children, className, ...props }, ref) => (
  <motion.div ref={ref} variants={fadeIn} initial="hidden" animate="visible" className={className} {...props}>
    {children}
  </motion.div>
));
FadeIn.displayName = 'FadeIn';

// ── SlideUp ─────────────────────────────────────────────────────────────────
// Content that slides up and fades in — common for content reveals.

interface SlideUpProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
}

export const SlideUp = forwardRef<HTMLDivElement, SlideUpProps>(({ children, className, ...props }, ref) => (
  <motion.div ref={ref} variants={slideUp} initial="hidden" animate="visible" className={className} {...props}>
    {children}
  </motion.div>
));
SlideUp.displayName = 'SlideUp';

// ── ScaleIn ─────────────────────────────────────────────────────────────────
// Subtle scale + fade — modals, cards appearing.

interface ScaleInProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
}

export const ScaleIn = forwardRef<HTMLDivElement, ScaleInProps>(({ children, className, ...props }, ref) => (
  <motion.div ref={ref} variants={scaleIn} initial="hidden" animate="visible" className={className} {...props}>
    {children}
  </motion.div>
));
ScaleIn.displayName = 'ScaleIn';

// ── AnimatedList ────────────────────────────────────────────────────────────
// Wraps a list of items with staggered entry animations.
//
// Usage:
//   <AnimatedList>
//     {items.map(item => (
//       <AnimatedListItem key={item.id}>
//         <YourCard />
//       </AnimatedListItem>
//     ))}
//   </AnimatedList>

interface AnimatedListProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay between items in seconds. Default: stagger.normal (50ms) */
  delay?: number;
}

export function AnimatedList({ children, className, delay = stagger.normal }: AnimatedListProps) {
  return (
    <motion.div variants={staggerContainer(0, delay)} initial="hidden" animate="visible" className={className}>
      {children}
    </motion.div>
  );
}

interface AnimatedListItemProps extends HTMLMotionProps<'div'> {
  children: ReactNode;
  className?: string;
}

export const AnimatedListItem = forwardRef<HTMLDivElement, AnimatedListItemProps>(
  ({ children, className, ...props }, ref) => (
    <motion.div ref={ref} variants={staggerItem} className={className} {...props}>
      {children}
    </motion.div>
  ),
);
AnimatedListItem.displayName = 'AnimatedListItem';
