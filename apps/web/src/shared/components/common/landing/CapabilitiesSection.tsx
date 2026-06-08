'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@sally/ui/components/ui/card';
import { PlanAnimation } from './PlanAnimation';
import { MonitorAnimation } from './MonitorAnimation';
import { CoordinateAnimation } from './CoordinateAnimation';
import { ScrollReveal } from './ScrollReveal';

export function CapabilitiesSection() {
  const capabilities = [
    {
      title: 'Plan',
      description:
        'Generate HOS-compliant routes with optimized stop sequences, automatic rest insertion, and fuel stops in seconds',
      animation: <PlanAnimation />,
    },
    {
      title: 'Monitor',
      description:
        'Track every active route continuously with 14 trigger types monitored every 60 seconds across your entire fleet',
      animation: <MonitorAnimation />,
    },
    {
      title: 'Coordinate',
      description:
        'Alert dispatchers when intervention is needed and automatically update drivers when conditions change',
      animation: <CoordinateAnimation />,
    },
  ];

  return (
    <section className="py-32 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <h2 className="text-5xl md:text-6xl font-bold tracking-tight text-center mb-12">Core Capabilities</h2>
          <p className="text-xl text-muted-foreground text-center max-w-3xl mx-auto mb-20">
            SALLY coordinates your fleet operations with automated planning, continuous monitoring, and proactive alerts
          </p>
        </ScrollReveal>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {capabilities.map((capability, index) => (
            <ScrollReveal key={capability.title} delay={index * 0.2}>
              <Card className="h-full hover:shadow-card-hover transition-shadow duration-300">
                <CardHeader>
                  <CardTitle className="text-2xl text-center">{capability.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {capability.animation}
                  <p className="text-muted-foreground leading-relaxed text-center">{capability.description}</p>
                </CardContent>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
