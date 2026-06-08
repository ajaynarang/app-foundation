'use client';

import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';

/**
 * Beat 08 — Proof band.
 *
 * One real, attributed voice from an early fleet, plus the systems SALLY
 * genuinely integrates. The "Private beta" pill is an honest signal that JYC
 * is an early customer — it must NOT imply broad adoption.
 *
 * Signature motion: a quiet fade (no blur), distinct from the blur-up
 * sections around it so the eye re-engages.
 *
 * NOTE: Anand Rituraj is a real dispatcher — this quote needs his sign-off
 * before it ships to production.
 */

const INTEGRATIONS = ['Samsara', 'QuickBooks', 'DAT'] as const;

export function ProofBand() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-60px' });
  const reduceMotion = useReducedMotion();

  return (
    <div ref={ref} className="w-full max-w-3xl mx-auto text-center">
      <motion.figure
        initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      >
        <span className="block text-[10px] tracking-[0.22em] uppercase text-caution mb-6">
          From a fleet running SALLY
        </span>

        <blockquote className="text-lg md:text-2xl leading-relaxed text-foreground font-medium tracking-tight">
          “I used to find out about a problem when a driver called me angry. Now Sally&apos;s already flagged it — and
          worked the invoices overnight, so I just read what she drafted and approve it with my coffee. And it&apos;s
          not some black box: the call&apos;s still mine.”
        </blockquote>

        <figcaption className="mt-7 flex items-center justify-center gap-3 text-sm text-muted-foreground">
          <span>
            <span className="text-foreground font-medium">Anand Rituraj</span> · Dispatcher, JYC
          </span>
          <span className="text-[9px] tracking-[0.16em] uppercase text-muted-foreground border border-border rounded-full px-2.5 py-1">
            Private beta
          </span>
        </figcaption>
      </motion.figure>

      {/* Integration wordmarks — genuinely connected systems */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ duration: 1, delay: 0.4 }}
        className="mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-muted-foreground/70"
      >
        {INTEGRATIONS.map((name) => (
          <span key={name} className="tracking-wide">
            {name}
          </span>
        ))}
        <span className="tracking-wide text-muted-foreground/50">+ your stack</span>
      </motion.div>
    </div>
  );
}
