'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { useAuthStore } from '@/features/auth';
import { getDefaultRouteForRole } from '@/shared/lib/navigation';
import { FlowText, FlowStagger } from './FlowText';
import { Pulse } from './Pulse';
import { NervousSystem } from './NervousSystem';
import { SignalSources } from './SignalSources';
import { CountUp } from './CountUp';
import './sally-nerve.css';
import { SignalFlicker } from './SignalFlicker';
import { VideoLightbox } from './VideoLightbox';
import { DeskHandoff } from './DeskHandoff';
import { ProofBand } from './ProofBand';

/**
 * Sally Nerve: "The Nervous System"
 *
 * Narrative arc: Stillness → Signal → Awakening → Four reflexes → Brain →
 *   The Desk (climax) → Dialogue → Proof → Certainty → Invitation
 *
 * The page tells the story of freight's nervous system coming alive — and
 * then acting. The climax is Sally's Desk: agents that do the work and hand
 * a human the decision. No "hero/problem/solution" framework — an
 * experiential journey through what it feels like when a fleet gains
 * awareness and a crew that acts on it.
 */
export function SallyNerveLanding() {
  const { isAuthenticated, user } = useAuthStore();
  const getStartedUrl =
    isAuthenticated && user
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getDefaultRouteForRole(user.role as any)
      : '/login';

  return (
    <div className="sn-canvas min-h-screen bg-background text-foreground relative">
      {/* ============================================================
          1. STILLNESS — Empty space, a single dot, then a word
          ============================================================ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center">
        <SignalFlicker />
        <div className="relative z-10 text-center">
          {/* A dot appears first */}
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-foreground mx-auto mb-16"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          />

          {/* Then the word emerges from the dot */}
          <motion.h1
            className="text-[18vw] md:text-[14vw] lg:text-[10vw] font-bold tracking-tighter leading-none font-space-grotesk"
            initial={{ opacity: 0, filter: 'blur(40px)', scale: 0.9 }}
            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            transition={{ duration: 1.5, delay: 1.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            SALLY
          </motion.h1>

          {/* Silence. Then one line. */}
          <motion.p
            className="mt-6 text-sm md:text-lg tracking-[0.3em] uppercase text-foreground/70 font-normal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.5, delay: 2.5 }}
          >
            Your fleet is already speaking. SALLY listens.
          </motion.p>

          {/* Video CTA */}
          <motion.div
            className="mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 3.5 }}
          >
            <VideoLightbox />
          </motion.div>
        </div>
      </section>

      {/* ============================================================
          2. SIGNAL — What happens when no one is listening
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center py-24">
        <div className="relative z-10 max-w-4xl mx-auto px-4 text-center">
          <FlowText as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-12">
            Every minute, your fleet sends thousands of signals
          </FlowText>

          <FlowStagger
            lines={[
              <>
                <span className="text-foreground font-medium">A driver runs out of hours</span> 40 miles from the dock.{' '}
                <span className="text-caution">— missed appointment, reset clock</span>
              </>,
              <>
                <span className="text-foreground font-medium">A dock runs 90 minutes behind</span> and no one
                reschedules. <span className="text-caution">— $1,200 detention</span>
              </>,
              <>
                <span className="text-foreground font-medium">An invoice ages past terms</span> while everyone&apos;s
                heads-down. <span className="text-caution">— cash stuck 40 days</span>
              </>,
              <>
                <span className="text-foreground font-medium">Fuel drops two exits ahead</span> — the driver never knew.{' '}
                <span className="text-caution">— $90 left on the road</span>
              </>,
            ]}
            className="space-y-4 max-w-xl mx-auto mb-16"
            lineClassName="text-sm md:text-base text-muted-foreground"
            delay={0.3}
          />

          <FlowText delay={1.2}>
            <p className="text-lg md:text-xl text-foreground font-medium">Right now, most of them go unheard.</p>
          </FlowText>
        </div>
      </section>

      {/* Pulse transition */}
      <div className="py-12">
        <Pulse className="h-20" />
      </div>

      {/* ============================================================
          3. AWAKENING — The nervous system comes alive
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center py-24">
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <FlowText as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-center mb-6">
            What if your fleet could feel?
          </FlowText>

          <FlowText delay={0.3}>
            <p className="text-sm md:text-base text-muted-foreground text-center max-w-lg mx-auto mb-16">
              SALLY connects every signal into a single nervous system. Every route, every driver, every variable —
              sensed, understood, acted on.
            </p>
          </FlowText>

          {/* Neural network visualization */}
          <NervousSystem />
        </div>
      </section>

      {/* ============================================================
          4. SENSATION — Four modes of awareness (sense → act)
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center py-24">
        <div className="relative z-10 max-w-6xl mx-auto px-4">
          <FlowText as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-center mb-20">
            Four reflexes
          </FlowText>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
            {[
              {
                number: '01',
                title: 'Anticipate',
                body: "Before a driver's clock runs out, before weather hits the corridor, before a dock delay cascades — SALLY sees it and routes around it.",
              },
              {
                number: '02',
                title: 'Adapt',
                body: 'Conditions change every minute. SALLY re-plans in seconds. New route. New rest stops. New fuel strategy — designed to keep every route compliant.',
              },
              {
                number: '03',
                title: 'Communicate',
                body: 'The right information reaches the right person at the right moment. Dispatchers get alerts. Drivers get updates. Everyone moves in sync.',
              },
              {
                number: '04',
                title: 'Act',
                body: "She doesn't just flag the overdue invoice — she drafts the follow-up in your voice and waits for your nod. Approve, edit, or let it send. She gets sharper every week.",
              },
            ].map((item, i) => (
              <motion.div
                key={item.number}
                initial={{ opacity: 0, y: 40, filter: 'blur(12px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className="text-center md:text-left"
              >
                <div className="text-2xs tracking-[0.4em] uppercase text-muted-foreground mb-4">{item.number}</div>
                <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-4 text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pulse transition */}
      <div className="py-12">
        <Pulse className="h-20" />
      </div>

      {/* ============================================================
          4.5. THE BRAIN — AI-powered route planning
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center py-24">
        <div className="relative z-10 max-w-5xl mx-auto px-4">
          <FlowText as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-center mb-6">
            A nervous system needs a brain
          </FlowText>

          <FlowText delay={0.3}>
            <p className="text-sm md:text-base text-muted-foreground text-center max-w-lg mx-auto mb-20">
              SALLY doesn&apos;t just sense signals — it thinks. AI-powered route planning that optimizes every mile,
              every stop, every hour.
            </p>
          </FlowText>

          <div className="grid md:grid-cols-2 gap-16 md:gap-12">
            {[
              {
                title: 'Intelligent Route Optimization',
                body: 'AI plans the fastest, most compliant route across every stop. Rest breaks, fuel stops, dock schedules — all factored in before the wheels turn.',
              },
              {
                title: 'HOS-Aware Planning',
                body: 'Every route is built around Hours of Service from the start. SALLY simulates the journey segment by segment, inserting rest stops exactly where they belong.',
              },
              {
                title: 'Smart Fuel Strategy',
                body: 'Real-time fuel prices meet route intelligence. SALLY finds the cheapest fuel along the route, factoring in tank range and time constraints.',
              },
              {
                title: 'Dynamic Re-Planning',
                body: 'When conditions change — weather, traffic, delays — SALLY re-plans the entire route in seconds. New plan, HOS-checked again, ready before the next turn.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: i * 0.15, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <h3 className="text-lg md:text-xl font-bold tracking-tight mb-3 text-foreground">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pulse transition */}
      <div className="py-12">
        <Pulse className="h-20" />
      </div>

      {/* ============================================================
          4.75. THE DESK — the climax: Sally doesn't just sense and think,
          she acts. A crew of agents that do the work and hand you the call.
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center py-24">
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <FlowText as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight text-center mb-6">
            Then she does the work
          </FlowText>

          <FlowText delay={0.3}>
            <p className="text-sm md:text-base text-muted-foreground text-center max-w-xl mx-auto mb-16">
              She doesn&apos;t just notice the overdue invoice. She drafts the follow-up — in your voice — and waits for
              your nod. You supervise a crew that works while you sleep.
            </p>
          </FlowText>

          <DeskHandoff />
        </div>
      </section>

      {/* Pulse transition */}
      <div className="py-12">
        <Pulse className="h-20" />
      </div>

      {/* ============================================================
          5. DIALOGUE — SALLY speaks
          ============================================================ */}
      <section className="relative min-h-[80vh] flex items-center justify-center py-24">
        <div className="relative z-10 max-w-3xl mx-auto px-4 text-center">
          <FlowText as="h2" className="text-3xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-16">
            It doesn&apos;t just monitor. It converses.
          </FlowText>

          {/* Conversation as poetry — minimal, floating */}
          <div className="space-y-12 max-w-md mx-auto">
            {[
              { speaker: 'dispatcher', text: '"Can driver 14 make the Memphis appointment?"' },
              {
                speaker: 'sally',
                text: '"Yes. 3.5 hours of drive time, 4.7 until appointment. 1.2-hour buffer. No rest stop needed — HOS compliant through delivery."',
              },
              { speaker: 'driver', text: '"Where do I take my 10-hour break?"' },
              {
                speaker: 'sally',
                text: '"Love\'s at Exit 47. 2.3 hours ahead. Keeps you compliant and on schedule after rest."',
              },
            ].map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
                whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                viewport={{ once: true }}
                transition={{ duration: 0.7, delay: i * 0.15 }}
                className={msg.speaker === 'sally' ? 'text-foreground' : 'text-muted-foreground'}
              >
                <span className="text-[9px] tracking-[0.3em] uppercase block mb-2 opacity-50">{msg.speaker}</span>
                <p
                  className={`text-sm md:text-base leading-relaxed ${
                    msg.speaker === 'sally' ? 'font-medium' : 'italic'
                  }`}
                >
                  {msg.text}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          6. SIGNAL SOURCES — Where the data flows from
          ============================================================ */}
      <section className="relative min-h-[70vh] flex items-center justify-center py-24">
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <FlowText as="h2" className="text-2xl md:text-4xl font-bold tracking-tight text-center mb-6 text-foreground">
            Connected at every nerve ending
          </FlowText>

          <FlowText delay={0.2}>
            <p className="text-sm md:text-base text-muted-foreground text-center max-w-lg mx-auto mb-16">
              SALLY listens to the systems you already use. Every signal, routed through one intelligence.
            </p>
          </FlowText>

          <SignalSources />
        </div>
      </section>

      {/* ============================================================
          6.5. PROOF — One real voice from an early fleet
          ============================================================ */}
      <section className="relative min-h-[60vh] flex items-center justify-center py-24">
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <ProofBand />
        </div>
      </section>

      {/* Pulse transition */}
      <div className="py-12">
        <Pulse className="h-20" />
      </div>

      {/* ============================================================
          7. CERTAINTY — The numbers, enormous and undeniable
          ============================================================ */}
      <section className="relative min-h-[70vh] flex items-center justify-center py-24">
        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <FlowText
            as="h2"
            className="text-2xl md:text-4xl font-bold tracking-tight text-center mb-20 text-muted-foreground"
          >
            The result of awareness
          </FlowText>

          <div className="space-y-20 md:space-y-24">
            {/* Each stat on its own "breath" */}
            {[
              {
                value: 185000,
                prefix: '$',
                suffix: '+',
                label: 'saved annually across a 50-truck fleet',
                footnote: 'Modeled · 50-truck fleet · 12 months',
              },
              {
                value: 520,
                label: 'dispatcher hours recovered per year',
                footnote: 'Modeled · 50-truck fleet',
              },
              {
                value: 0,
                label: 'HOS violations across planned routes — every route is HOS-checked before the wheels turn',
                footnote: 'Every route HOS-checked before dispatch',
              },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8 }}
                className={`text-center ${i === 1 ? 'md:text-right md:pr-20' : i === 2 ? 'md:text-left md:pl-20' : ''}`}
              >
                <div className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tighter text-foreground leading-none mb-3">
                  <CountUp to={stat.value} prefix={stat.prefix} suffix={stat.suffix} />
                </div>
                <motion.p
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.8 }}
                  className={`text-xs md:text-sm tracking-wide text-muted-foreground max-w-xs mx-auto ${i === 1 ? 'md:ml-auto' : 'md:mx-0'}`}
                >
                  {stat.label}
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 1 }}
                  className={`mt-2 text-[10px] tracking-wide text-muted-foreground/60 max-w-xs mx-auto ${i === 1 ? 'md:ml-auto' : 'md:mx-0'}`}
                >
                  {stat.footnote}
                </motion.p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          7. INVITATION — The quietest CTA
          ============================================================ */}
      <section className="relative min-h-[60vh] flex items-center justify-center py-24">
        <div className="relative z-10 text-center px-4">
          <FlowText as="p" className="text-lg md:text-xl text-muted-foreground mb-12 max-w-md mx-auto" delay={0}>
            Your fleet is already sending signals. Give it a nervous system.
          </FlowText>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <Link href={getStartedUrl}>
              <Button
                size="lg"
                className="px-10 md:px-12 py-8 text-base md:text-lg h-auto rounded-full tracking-[0.2em] uppercase font-light transition-all hover:scale-105"
              >
                {isAuthenticated ? 'Enter' : 'See SALLY on your fleet'}
              </Button>
            </Link>
          </motion.div>

          {/* Barely visible trust line */}
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="mt-12 text-xs tracking-[0.3em] uppercase text-muted-foreground"
          >
            For fleets that refuse to fly blind
          </motion.p>
        </div>
      </section>
    </div>
  );
}
