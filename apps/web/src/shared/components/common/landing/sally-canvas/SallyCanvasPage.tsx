'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@app/ui/components/ui/button';
import { useAuthStore } from '@/features/auth';
import { getDefaultRouteForRole } from '@/shared/lib/navigation';
import { AmbientCanvas } from './AmbientCanvas';
import { MaterializeText } from './MaterializeText';
import { BreathingOrb } from './BreathingOrb';
import { ConstellationGrid } from './ConstellationGrid';
import './sally-canvas.css';

export function SallyCanvasLanding() {
  const { isAuthenticated, user } = useAuthStore();
  const getStartedUrl =
    isAuthenticated && user
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getDefaultRouteForRole(user.role as any)
      : '/login';

  return (
    <div className="sc-canvas min-h-screen bg-background text-foreground relative">
      {/* ============================================================
          Section 1: "The Presence" — Hero
          ============================================================ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <AmbientCanvas temperature="neutral" intensity={1} />

        <div className="relative z-10 text-center px-4">
          {/* Giant "S" materializes first, then the rest */}
          <div className="mb-6 md:mb-8">
            <h1 className="text-[20vw] md:text-[15vw] lg:text-[12vw] font-bold tracking-tighter leading-none font-space-grotesk">
              <motion.span
                initial={{ opacity: 0, filter: 'blur(30px)' }}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                className="inline-block"
              >
                S
              </motion.span>
              {'ALLY'.split('').map((letter, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, filter: 'blur(20px)' }}
                  animate={{ opacity: 1, filter: 'blur(0px)' }}
                  transition={{
                    duration: 0.6,
                    delay: 0.8 + i * 0.15,
                    ease: 'easeOut',
                  }}
                  className="inline-block"
                >
                  {letter}
                </motion.span>
              ))}
            </h1>
          </div>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, filter: 'blur(10px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            transition={{ duration: 0.8, delay: 1.8 }}
            className="text-sm md:text-base lg:text-lg tracking-[0.3em] md:tracking-[0.4em] uppercase text-muted-foreground font-light"
          >
            Fleet Operations, Reimagined
          </motion.p>
        </div>

        {/* Scroll hint — appears after 2s */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 3, duration: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-2xs tracking-[0.3em] uppercase text-muted-foreground">Scroll to enter</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-px h-8 bg-gradient-to-b from-muted-foreground to-transparent"
          />
        </motion.div>
      </section>

      {/* ============================================================
          Section 2: "The Problem" — Tension
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-20">
        <AmbientCanvas temperature="warm" intensity={0.6} />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-4">
          {/* DISPATCH and DRIVER pushed apart */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-8 md:gap-4">
            {/* Dispatch word */}
            <div className="text-center md:text-left">
              <MaterializeText
                as="h2"
                className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-foreground"
                delay={0}
              >
                DISPATCH
              </MaterializeText>
            </div>

            {/* Pain points in the gap */}
            <div className="flex-1 max-w-xs mx-auto md:mx-0 text-center py-8 md:py-0">
              <motion.div
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 1, delay: 0.5 }}
                className="space-y-3"
              >
                {['Manual tracking.', 'Blind spots.', 'Reactive chaos.'].map((text, i) => (
                  <motion.p
                    key={i}
                    initial={{ opacity: 0, filter: 'blur(8px)' }}
                    whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: 0.8 + i * 0.2 }}
                    className="text-sm md:text-base text-muted-foreground"
                  >
                    {text}
                  </motion.p>
                ))}
              </motion.div>
            </div>

            {/* Driver word */}
            <div className="text-center md:text-right">
              <MaterializeText
                as="h2"
                className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-foreground"
                delay={0.3}
              >
                DRIVER
              </MaterializeText>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          Section 3: "The Bridge" — SALLY Appears
          ============================================================ */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden py-20">
        <AmbientCanvas temperature="cool" intensity={0.7} />

        <div className="relative z-10 text-center px-4">
          {/* SALLY materializes in the gap */}
          <MaterializeText
            as="h2"
            className="text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-foreground mb-16"
            delay={0}
          >
            SALLY
          </MaterializeText>

          {/* Three floating capability tokens */}
          <div className="flex flex-wrap justify-center gap-6 md:gap-10 mb-12">
            {[
              { label: 'Plan', desc: 'HOS-compliant routes with optimized stops in seconds' },
              { label: 'Monitor', desc: '14 trigger types tracked every 60 seconds, 24/7' },
              { label: 'Coordinate', desc: 'Proactive alerts to dispatchers, live updates to drivers' },
            ].map((cap, i) => (
              <motion.div
                key={cap.label}
                initial={{ opacity: 0, filter: 'blur(12px)', y: 20 }}
                whileInView={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.5 + i * 0.2 }}
                className="group text-center max-w-[200px]"
              >
                <div className="text-lg md:text-xl font-semibold tracking-wide text-foreground mb-2">{cap.label}</div>
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  whileInView={{ opacity: 1, height: 'auto' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.8 + i * 0.2 }}
                  className="text-xs md:text-sm text-muted-foreground leading-relaxed"
                >
                  {cap.desc}
                </motion.p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          Section 4: "Living Awareness" — Monitoring Constellation
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-20">
        <AmbientCanvas temperature="neutral" intensity={0.4} />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <MaterializeText
            as="h2"
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-center text-foreground mb-4"
            delay={0}
          >
            Living Awareness
          </MaterializeText>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-sm md:text-base text-muted-foreground text-center mb-16 max-w-lg mx-auto"
          >
            Every route, continuously monitored. Every risk, detected before it becomes a problem.
          </motion.p>

          <ConstellationGrid />
        </div>
      </section>

      {/* ============================================================
          Section 5: "The Intelligence" — Ask SALLY
          ============================================================ */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden py-20">
        <AmbientCanvas temperature="cool" intensity={0.5} />

        <div className="relative z-10 w-full max-w-3xl mx-auto px-4">
          <MaterializeText
            as="h2"
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-center text-foreground mb-4"
            delay={0}
          >
            The Intelligence
          </MaterializeText>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-sm md:text-base text-muted-foreground text-center mb-20 max-w-md mx-auto"
          >
            Ask anything. SALLY understands context, knows your fleet, and responds instantly.
          </motion.p>

          <BreathingOrb />
        </div>
      </section>

      {/* ============================================================
          Section 6: "The Impact" — Metrics
          ============================================================ */}
      <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden py-20">
        <AmbientCanvas temperature="warm" intensity={0.5} />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-16 md:gap-24">
            {[
              { value: '$185K+', label: 'Save Annually' },
              { value: '520', label: 'Hours Recovered' },
              { value: '100%', label: 'HOS Compliant' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, filter: 'blur(20px)', scale: 0.9 }}
                whileInView={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: i * 0.2 }}
                className="text-center"
              >
                <div className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-foreground mb-2">
                  {stat.value}
                </div>
                {/* Label fades in after the number */}
                <motion.div
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: 0.5 + i * 0.2 }}
                  className="text-xs md:text-sm tracking-[0.2em] uppercase text-muted-foreground"
                >
                  {stat.label}
                </motion.div>

                {/* Liquid fill bar */}
                <motion.div className="mt-4 mx-auto h-1 w-16 md:w-24 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
                  <motion.div
                    className="h-full bg-foreground rounded-full"
                    initial={{ width: 0 }}
                    whileInView={{ width: '100%' }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 1.5,
                      delay: 0.3 + i * 0.2,
                      ease: 'easeOut',
                    }}
                  />
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================
          Section 7: "Enter" — CTA
          ============================================================ */}
      <section className="relative min-h-[60vh] flex items-center justify-center overflow-hidden py-20">
        <AmbientCanvas temperature="warm" intensity={0.8} />

        <div className="relative z-10 text-center px-4">
          <motion.div
            initial={{ opacity: 0, filter: 'blur(16px)', scale: 0.95 }}
            whileInView={{ opacity: 1, filter: 'blur(0px)', scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
          >
            <Link href={getStartedUrl}>
              <Button
                size="lg"
                className="px-12 py-8 text-lg md:text-xl h-auto rounded-full tracking-widest uppercase font-light transition-all hover:scale-105 hover:shadow-lg"
              >
                {isAuthenticated ? 'Enter' : 'Begin'}
              </Button>
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-8 text-2xs md:text-xs tracking-[0.2em] uppercase text-muted-foreground/50"
          >
            Trusted by forward-thinking fleets
          </motion.p>
        </div>
      </section>
    </div>
  );
}
