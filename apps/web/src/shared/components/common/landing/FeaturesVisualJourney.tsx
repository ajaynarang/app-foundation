'use client';

import { motion } from 'framer-motion';
import { ScrollReveal } from './ScrollReveal';
import { RouteIcon, MonitorIcon, AlertIcon, ComplianceIcon, RestIcon, FuelIcon } from './FeatureCard';

export function FeaturesVisualJourney() {
  const stages = [
    {
      number: 1,
      title: 'Automated Planning',
      icon: <RouteIcon />,
      features: [
        { icon: <RouteIcon />, title: 'Smart Routing', desc: 'Routes optimized with HOS, fuel, rest, and efficiency' },
        { icon: <RestIcon />, title: 'Auto Rest Insertion', desc: 'Optimal rest stops before violations' },
        { icon: <FuelIcon />, title: 'Smart Fuel Stops', desc: 'Best price, location, and efficiency' },
      ],
    },
    {
      number: 2,
      title: 'Continuous Monitoring',
      icon: <MonitorIcon />,
      features: [
        { icon: <MonitorIcon />, title: '24/7 Monitoring', desc: '14 triggers every 60 seconds' },
        { icon: <AlertIcon />, title: 'Proactive Alerts', desc: 'Notify dispatchers instantly' },
      ],
    },
    {
      number: 3,
      title: 'Deliver Results',
      icon: <ComplianceIcon />,
      features: [{ icon: <ComplianceIcon />, title: 'Zero Violations', desc: '100% HOS compliance guaranteed' }],
    },
  ];

  return (
    <section className="py-32 bg-muted">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12">
            Intelligence That Works For You
          </h2>
          <p className="text-xl text-muted-foreground text-center max-w-3xl mx-auto mb-20">
            From planning to execution, SALLY handles the complexity
          </p>
        </ScrollReveal>

        {/* Visual Journey Timeline */}
        <div className="relative">
          {/* Connection line */}
          <div className="hidden lg:block absolute top-20 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-border to-transparent" />

          <div className="grid lg:grid-cols-3 gap-12 relative">
            {stages.map((stage, stageIndex) => (
              <ScrollReveal key={stage.number} delay={stageIndex * 0.2}>
                <div className="relative">
                  {/* Stage number badge */}
                  <div className="flex justify-center mb-6">
                    <motion.div
                      className="relative"
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: stageIndex * 0.2 + 0.3, type: 'spring', stiffness: 200 }}
                    >
                      <div className="w-16 h-16 rounded-full bg-black dark:bg-white flex items-center justify-center relative z-10">
                        <span className="text-2xl font-bold text-white dark:text-black">{stage.number}</span>
                      </div>
                    </motion.div>
                  </div>

                  {/* Stage title */}
                  <h3 className="text-2xl font-bold text-center mb-8 text-foreground">{stage.title}</h3>

                  {/* Features in this stage */}
                  <div className="space-y-4">
                    {stage.features.map((feature, idx) => (
                      <motion.div
                        key={idx}
                        className="bg-background rounded-lg p-4 border border-border hover:shadow-lg transition-shadow"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: stageIndex * 0.2 + idx * 0.1 + 0.5 }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">{feature.icon}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-foreground mb-1">{feature.title}</h4>
                            <p className="text-xs text-muted-foreground leading-relaxed">{feature.desc}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
