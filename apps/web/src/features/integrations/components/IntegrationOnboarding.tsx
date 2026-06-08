'use client';

import { useState } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { CheckCircle2, ArrowRight, Gauge, Package, Droplet, Cloud } from 'lucide-react';

interface IntegrationOnboardingProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function IntegrationOnboarding({ onComplete, onSkip }: IntegrationOnboardingProps) {
  const [step, setStep] = useState<'welcome' | 'benefits' | 'categories'>('welcome');

  if (step === 'welcome') {
    return (
      <Card className="border-2">
        <CardHeader className="text-center pb-4">
          <div className="mx-auto mb-4 p-4 rounded-full bg-blue-500/10 dark:bg-blue-500/20 w-fit">
            <CheckCircle2 className="h-12 w-12 text-blue-500" />
          </div>
          <CardTitle className="text-2xl">Welcome to Integrations</CardTitle>
          <p className="text-muted-foreground mt-2">Connect SALLY with your existing systems to automate data sync</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Automatic Data Sync</p>
                <p className="text-xs text-muted-foreground">No manual data entry needed</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Real-Time Updates</p>
                <p className="text-xs text-muted-foreground">Always use latest HOS, fuel prices, weather</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium text-sm">Reduce Errors</p>
                <p className="text-xs text-muted-foreground">Eliminate manual mistakes</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onSkip} className="flex-1">
              Skip for Now
            </Button>
            <Button onClick={() => setStep('categories')} className="flex-1">
              Get Started
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (step === 'categories') {
    const categories = [
      {
        icon: Gauge,
        color: 'blue',
        title: 'Hours of Service',
        description: 'Connect your ELD to track driver hours automatically',
        recommended: true,
        examples: ['Samsara', 'KeepTruckin', 'Motive'],
      },
      {
        icon: Package,
        color: 'purple',
        title: 'Load Management',
        description: 'Sync loads and assignments from your TMS',
        recommended: true,
        examples: ['McLeod', 'TMW'],
      },
      {
        icon: Droplet,
        color: 'green',
        title: 'Fuel Prices',
        description: 'Get real-time fuel prices for route optimization',
        recommended: false,
        examples: ['GasBuddy'],
      },
      {
        icon: Cloud,
        color: 'cyan',
        title: 'Weather',
        description: 'Get weather forecasts along routes',
        recommended: false,
        examples: ['OpenWeather'],
      },
    ];

    return (
      <Card className="border-2">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">What would you like to connect?</CardTitle>
          <p className="text-muted-foreground mt-2">Start with HOS and TMS for best results</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <div
                key={category.title}
                className="flex items-start gap-4 p-4 rounded-lg border border-border hover:border-foreground/20 transition-colors"
              >
                <div className={`p-2 rounded-lg bg-${category.color}-500/10 dark:bg-${category.color}-500/20`}>
                  <Icon className={`h-6 w-6 text-${category.color}-500`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{category.title}</h4>
                    {category.recommended && (
                      <Badge variant="muted" className="text-xs">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{category.description}</p>
                  <p className="text-xs text-muted-foreground mt-2">Examples: {category.examples.join(', ')}</p>
                </div>
              </div>
            );
          })}

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={onSkip} className="flex-1">
              I&apos;ll Set Up Later
            </Button>
            <Button onClick={onComplete} className="flex-1">
              Choose Integration
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return null;
}
