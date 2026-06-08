'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@sally/ui/components/ui/button';
import { ScrollReveal } from './ScrollReveal';
import { HeroRouteBackground } from './AnimatedRoute';
import { ROICalculator } from './ROICalculator';
import { MonitoringDashboard } from './MonitoringDashboard';
import { CapabilitiesSection } from './CapabilitiesSection';
import { AskSallySection } from './AskSallySection';
import { FeaturesVisualJourney } from './FeaturesVisualJourney';
import { useAuthStore } from '@/features/auth';
import { getDefaultRouteForRole } from '@/shared/lib/navigation';

export function LandingPage() {
  const { isAuthenticated, user } = useAuthStore();

  // Get the appropriate destination for "Get Started" button
  const getStartedUrl =
    isAuthenticated && user
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        getDefaultRouteForRole(user.role as any)
      : '/login';
  return (
    <div className="min-h-screen bg-background smooth-scroll">
      {/* Section 1: Hero */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-background">
        <HeroRouteBackground />

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter mb-6 text-gradient font-space-grotesk">
              SALLY
            </h1>
            <p className="text-2xl md:text-3xl text-foreground mb-4 font-semibold tracking-tight">
              Your Fleet Operations Assistant
            </p>
            <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto mb-12">
              Coordinate dispatchers and drivers with automated planning, continuous monitoring, and proactive alerts
            </p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Link href={getStartedUrl}>
                <Button size="lg" className="px-8 py-6 text-lg h-auto rounded-lg transition-all hover:scale-105">
                  {isAuthenticated ? 'Go to App' : 'Get Started'}
                </Button>
              </Link>
              <Button
                size="lg"
                variant="outline"
                className="border-2 border-foreground text-foreground hover:bg-muted px-8 py-6 text-lg h-auto rounded-lg transition-all hover:scale-105"
                onClick={() => {
                  document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                See How It Works
              </Button>
            </motion.div>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="absolute bottom-12 left-1/2 transform -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="w-6 h-10 border-2 border-gray-400 dark:border-gray-600 rounded-full flex items-start justify-center p-2"
            >
              <div className="w-1 h-2 bg-gray-400 dark:bg-gray-600 rounded-full" />
            </motion.div>
          </motion.div>
        </div>
      </section>
      {/* Section 2: The Coordination Gap */}
      <section className="py-32 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-20">The Coordination Gap</h2>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Dispatcher side */}
            <ScrollReveal variant="slide-right">
              <div className="relative">
                <div className="absolute -top-6 -left-6 text-9xl font-bold text-gray-200 dark:text-gray-800 leading-none">
                  D
                </div>
                <div className="relative bg-background p-8 border-2 border-border rounded-lg">
                  <h3 className="text-2xl font-bold text-foreground mb-6">Dispatcher Pain</h3>
                  <ul className="space-y-4">
                    <PainPoint>Manual HOS tracking across fleet</PainPoint>
                    <PainPoint>No visibility into route feasibility</PainPoint>
                    <PainPoint>Reactive problem solving</PainPoint>
                    <PainPoint>Constant driver check-ins for status</PainPoint>
                    <PainPoint>Hours spent on coordination calls</PainPoint>
                  </ul>
                </div>
              </div>
            </ScrollReveal>

            {/* Driver side */}
            <ScrollReveal variant="slide-left">
              <div className="relative">
                <div className="absolute -top-6 -right-6 text-9xl font-bold text-gray-200 dark:text-gray-800 leading-none">
                  D
                </div>
                <div className="relative bg-background p-8 border-2 border-border rounded-lg">
                  <h3 className="text-2xl font-bold text-foreground mb-6">Driver Pain</h3>
                  <ul className="space-y-4">
                    <PainPoint>No clear route plan from dispatch</PainPoint>
                    <PainPoint>Manual rest timing decisions</PainPoint>
                    <PainPoint>HOS violation stress</PainPoint>
                    <PainPoint>Inefficient fuel stops</PainPoint>
                    <PainPoint>Constant uncertainty about next steps</PainPoint>
                  </ul>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* Breaking line */}
          <ScrollReveal delay={0.5}>
            <div className="mt-16 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t-2 border-dashed border-gray-300 dark:border-gray-700" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-muted px-6 py-2 text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  The Gap SALLY Fills
                </span>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Section 3: Three Core Capabilities */}
      <CapabilitiesSection />

      {/* Section 4: One Platform */}
      {/* <section className="py-32 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12">
              One Platform. Zero Violations.
            </h2>
            <p className="text-xl text-muted-foreground text-center max-w-3xl mx-auto mb-20">
              Watch as SALLY plans an HOS-compliant route with optimized stops
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <AnimatedRoute />
          </ScrollReveal>

          <StaggerContainer className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20">
            <StaggerItem>
              <div className="text-center">
                <div className="text-5xl font-bold text-foreground mb-2">5-10</div>
                <div className="text-sm text-muted-foreground">Stops Optimized</div>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="text-center">
                <div className="text-5xl font-bold text-foreground mb-2">&lt;5s</div>
                <div className="text-sm text-muted-foreground">Planning Time</div>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="text-center">
                <div className="text-5xl font-bold text-foreground mb-2">100%</div>
                <div className="text-sm text-muted-foreground">HOS Compliant</div>
              </div>
            </StaggerItem>
            <StaggerItem>
              <div className="text-center">
                <div className="text-5xl font-bold text-foreground mb-2">24/7</div>
                <div className="text-sm text-muted-foreground">Monitoring</div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section> */}

      {/* Section 5: Visual Journey Alternative */}
      <FeaturesVisualJourney />

      {/* Section 6: Ask SALLY */}
      <AskSallySection />

      {/* Section 7: Continuous Monitoring */}
      <section className="py-32 bg-gradient-to-b from-black to-gray-900 dark:from-gray-950 dark:to-black">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12 text-white">
              Always Watching. Always Ready.
            </h2>
            <p className="text-xl text-gray-400 text-center max-w-3xl mx-auto mb-20">
              SALLY monitors every active route continuously to catch and prevent issues before they impact your
              operations
            </p>
          </ScrollReveal>

          <MonitoringDashboard />
        </div>
      </section>

      {/* Section 8: ROI Calculator */}
      <section className="py-32 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12">Calculate Your Savings</h2>
            <p className="text-xl text-muted-foreground text-center max-w-3xl mx-auto mb-20">
              See how much SALLY can save your fleet by preventing HOS violations and improving efficiency
            </p>
          </ScrollReveal>

          <ROICalculator />
        </div>
      </section>

      {/* Section 9: Integration Ecosystem */}
      <section className="py-32 bg-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12">Plugs The Gap</h2>
            <p className="text-xl text-muted-foreground text-center max-w-3xl mx-auto mb-20">
              SALLY integrates with your existing systems to provide the intelligence layer they&apos;re missing
            </p>
          </ScrollReveal>

          <ScrollReveal delay={0.3}>
            <div className="relative max-w-4xl mx-auto">
              {/* Center: SALLY */}
              <div className="flex items-center justify-center mb-20">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="relative z-10 bg-primary text-primary-foreground px-12 py-8 rounded-lg text-center"
                >
                  <div className="text-4xl font-bold mb-2 font-space-grotesk">SALLY</div>
                  <div className="text-sm text-muted-foreground">Intelligence Layer</div>
                </motion.div>
              </div>

              {/* Integration points */}
              <div className="grid md:grid-cols-3 gap-8">
                <IntegrationCard
                  title="TMS Systems"
                  description="Load data, delivery requirements"
                  examples={['project44', 'McLeod', 'TMW']}
                />
                <IntegrationCard
                  title="ELD/Telematics"
                  description="Real-time HOS, location data"
                  examples={['Samsara', 'KeepTruckin', 'Geotab']}
                />
                <IntegrationCard
                  title="External Data"
                  description="Fuel prices, weather, traffic"
                  examples={['OPIS', 'Weather APIs', 'HERE Maps']}
                />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Section 10: Final CTA */}
      <section className="py-32 bg-black dark:bg-gray-950">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ScrollReveal>
            <h2 className="text-6xl md:text-7xl font-bold tracking-tight mb-6 text-white">
              Coordinate smarter,
              <br />
              not harder
            </h2>
            <p className="text-2xl text-gray-400 mb-12">
              Join fleets who&apos;ve eliminated the coordination gap between dispatch and drivers
            </p>

            <motion.div whileHover={{ scale: 1.05 }} className="inline-block">
              <Link href={getStartedUrl}>
                <Button
                  size="lg"
                  className="bg-white text-black hover:bg-gray-200 dark:bg-white dark:text-black dark:hover:bg-gray-200 px-12 py-8 text-xl h-auto rounded-lg"
                >
                  {isAuthenticated ? 'Go to Dashboard' : 'Start Free Trial'}
                </Button>
              </Link>
            </motion.div>

            <p className="text-sm text-gray-500 mt-8">Trusted by forward-thinking fleets</p>
          </ScrollReveal>
        </div>
      </section>
    </div>
  );
}

// Helper components
function PainPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <svg
        className="w-5 h-5 text-muted-foreground mt-0.5 flex-shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}

function IntegrationCard({ title, description, examples }: { title: string; description: string; examples: string[] }) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-background p-6 border border-border rounded-lg text-center transition-all hover:shadow-card-hover"
    >
      <h3 className="text-xl font-bold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {examples.map((example) => (
          <span key={example} className="px-3 py-1 bg-muted text-gray-700 dark:text-gray-300 text-xs rounded-full">
            {example}
          </span>
        ))}
      </div>
    </motion.div>
  );
}
