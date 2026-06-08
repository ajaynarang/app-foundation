'use client';

import Link from 'next/link';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef } from 'react';
import { ArrowRight } from 'lucide-react';

/**
 * Beat 06 — "The Desk": the climax of the landing narrative.
 *
 * A near-exact render of the real "Needs you" handoff surface, shown as if
 * Sally just placed a drafted AR follow-up on the dispatcher's desk overnight.
 * Everything here is ILLUSTRATIVE marketing copy — the card and its
 * Approve / Edit / Reject controls are non-interactive and aria-hidden so
 * assistive tech isn't told there are buttons that do nothing. The only real
 * interactive element is the mid-page CTA link beneath the card.
 *
 * Honesty: AR follow-up (sally-billing) is the one live responsibility today;
 * the rest of the crew is framed as "coming online", never as live.
 */

const EPISODE_STEPS = ['Hydrate', 'Perceive', 'Decide', 'Draft'] as const;

const CREW = [
  { key: 'sally-billing', live: true },
  { key: 'sally-route', live: false },
  { key: 'sally-dispatch', live: false },
  { key: 'sally-compliance', live: false },
  { key: 'sally-maintenance', live: false },
  { key: 'sally-payroll', live: false },
] as const;

const HANDOFF_ACTIONS = [
  { label: 'Approve & send', primary: true },
  { label: 'Edit', primary: false },
  { label: 'Reject', primary: false },
] as const;

export function DeskHandoff() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  const reduceMotion = useReducedMotion();

  // Signature motion for this section: the card slides in from the side,
  // like it's being set down on a desk. Reduced-motion → plain fade.
  const cardInitial = reduceMotion ? { opacity: 0 } : { opacity: 0, x: 48, filter: 'blur(10px)' };
  const cardAnimate = isInView ? (reduceMotion ? { opacity: 1 } : { opacity: 1, x: 0, filter: 'blur(0px)' }) : {};

  return (
    <div ref={ref} className="w-full max-w-2xl mx-auto">
      {/* The handoff card — illustrative, non-interactive */}
      <motion.div
        initial={cardInitial}
        animate={cardAnimate}
        transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
        aria-hidden="true"
        className="rounded-2xl border border-border bg-card/60 backdrop-blur-sm p-5 md:p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.35)] dark:shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)]"
      >
        {/* Faint step trail — the real episode steps, ending at the gate */}
        <div className="flex flex-wrap items-center gap-1.5 text-[9px] tracking-[0.12em] uppercase text-muted-foreground/70 mb-4">
          {EPISODE_STEPS.map((step) => (
            <span key={step} className="flex items-center gap-1.5">
              {step}
              <span className="text-muted-foreground/40">→</span>
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-caution">Gate ◆ needs you</span>
        </div>

        {/* Header row */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="relative flex h-2 w-2">
            {!reduceMotion && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-caution opacity-60 animate-ping" />
            )}
            <span className="relative inline-flex h-2 w-2 rounded-full bg-caution" />
          </span>
          <span className="text-[10px] tracking-[0.22em] uppercase text-caution font-medium">Needs you</span>
          <span className="ml-auto text-[11px] text-muted-foreground">sally-billing · 2:14 AM</span>
        </div>

        {/* Title */}
        <h3 className="text-sm md:text-base font-semibold text-foreground mb-3">
          Follow up — Invoice #4471, Cardinal Logistics
        </h3>

        {/* Drafted message body */}
        <p className="text-xs md:text-sm leading-relaxed text-muted-foreground bg-background/60 border border-border rounded-lg px-3.5 py-3">
          “Hi Dana — invoice #4471 ($3,240) is 4 days past terms. Just a friendly check-in on timing for payment. Happy
          to resend the BOL if that helps. — Sent on behalf of Ravi, Meridian Freight”
        </p>

        {/* Illustrative actions */}
        <div className="flex flex-wrap gap-2 mt-4">
          {HANDOFF_ACTIONS.map((action) => (
            <span
              key={action.label}
              className={
                action.primary
                  ? 'text-xs font-medium px-4 py-2 rounded-full bg-foreground text-background'
                  : 'text-xs px-4 py-2 rounded-full border border-border text-foreground'
              }
            >
              {action.label}
            </span>
          ))}
        </div>

        {/* Crew strip — one live, the rest coming online (roadmap, not live) */}
        <div className="flex flex-wrap items-center gap-1.5 mt-5 pt-4 border-t border-border">
          {CREW.map((agent) => (
            <span
              key={agent.key}
              className={
                agent.live
                  ? 'text-[10px] px-2.5 py-1 rounded-full border border-emerald-600/40 text-emerald-600 dark:text-emerald-400'
                  : 'text-[10px] px-2.5 py-1 rounded-full border border-border text-muted-foreground'
              }
            >
              {agent.live ? `● ${agent.key} · live` : agent.key}
            </span>
          ))}
          <span className="text-[10px] px-2.5 py-1 text-muted-foreground/70">+ more coming online</span>
        </div>
      </motion.div>

      {/* Mid-page CTA — the only real interactive element here */}
      <div className="mt-8 text-center">
        <Link
          href="/product"
          className="inline-flex items-center gap-1.5 text-xs md:text-sm text-muted-foreground hover:text-foreground transition-colors tracking-wide"
        >
          See what Sally&apos;s already handling
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
