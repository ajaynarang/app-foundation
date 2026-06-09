/**
 * Platform Motion System — Reusable Framer Motion Variants
 *
 * Usage:
 *   import { fadeIn, slideUp, staggerContainer } from '@/shared/lib/motion';
 *   <motion.div variants={fadeIn} initial="hidden" animate="visible" />
 */

import type { Variants } from 'framer-motion';
import { duration, easing, distance, stagger } from './config';

// ── Fade Variants ───────────────────────────────────────────────────────────

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.normal, ease: easing.out },
  },
  exit: {
    opacity: 0,
    transition: { duration: duration.fast, ease: easing.in },
  },
};

// ── Slide Variants ──────────────────────────────────────────────────────────

export const slideUp: Variants = {
  hidden: { opacity: 0, y: distance.small },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.out },
  },
  exit: {
    opacity: 0,
    y: -distance.micro,
    transition: { duration: duration.fast, ease: easing.in },
  },
};

export const slideDown: Variants = {
  hidden: { opacity: 0, y: -distance.small },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.out },
  },
  exit: {
    opacity: 0,
    y: distance.micro,
    transition: { duration: duration.fast, ease: easing.in },
  },
};

// ── Scale Variants ──────────────────────────────────────────────────────────

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.97 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: duration.normal, ease: easing.out },
  },
  exit: {
    opacity: 0,
    scale: 0.97,
    transition: { duration: duration.fast, ease: easing.in },
  },
};

// ── Page Transition Variants ────────────────────────────────────────────────

export const pageEnter: Variants = {
  hidden: { opacity: 0, y: distance.medium },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.moderate, ease: easing.emphasized },
  },
};

// ── Stagger Container Variants ──────────────────────────────────────────────

export const staggerContainer = (delayChildren = 0, staggerDelay: number = stagger.normal): Variants => ({
  // Container stays visible — only children animate via stagger
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren,
      staggerChildren: staggerDelay,
    },
  },
});

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: distance.small },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: duration.normal, ease: easing.out },
  },
};

// ── Table Row Variant (fast stagger, minimal movement) ──────────────────────

export const tableRowVariant: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: duration.fast, ease: easing.out },
  },
};

export const tableContainer = (staggerDelay: number = stagger.fast): Variants => ({
  hidden: { opacity: 1 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: staggerDelay,
    },
  },
});
