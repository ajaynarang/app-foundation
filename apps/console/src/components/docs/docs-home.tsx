'use client';

import Link from 'next/link';
import { Route, Clock, Bell, Truck, Webhook, Building2 } from 'lucide-react';

const FEATURES = [
  {
    icon: Route,
    title: 'Route Planning',
    description: 'HOS-compliant route optimization with automatic rest and fuel stop insertion.',
    href: '/docs/api-guides/route-planning/creating-routes',
  },
  {
    icon: Clock,
    title: 'HOS Compliance',
    description: 'Segment-by-segment Hours of Service validation. Zero violations guaranteed.',
    href: '/docs/api-guides/route-planning/understanding-hos',
  },
  {
    icon: Bell,
    title: 'Real-time Alerts',
    description: '20 alert types — HOS violations, delays, deviations — pushed to your system via webhooks.',
    href: '/docs/webhooks',
  },
  {
    icon: Truck,
    title: 'Fleet Management',
    description: 'Drivers, vehicles, and loads via REST API. Full CRUD with role-based access.',
    href: '/docs/api-guides/fleet-management/drivers',
  },
  {
    icon: Webhook,
    title: 'Webhook Events',
    description: 'Subscribe to route, load, and alert events. HMAC-signed payloads with retry logic.',
    href: '/docs/webhooks',
  },
  {
    icon: Building2,
    title: 'White-label / Multi-tenant',
    description: 'Provision isolated tenants for your customers. Full data isolation guaranteed.',
    href: '/docs/api-guides/multi-tenancy/tenant-setup',
  },
];

const STEPS = [
  {
    number: '1',
    title: 'Generate an API key',
    description: 'Sign in and create your first staging key in seconds.',
    href: '/developer/api-keys',
    cta: 'Get API Keys →',
  },
  {
    number: '2',
    title: 'Plan your first route',
    description: 'POST a route with drivers, vehicles, and stops. Get back a compliance-checked plan.',
    href: '/docs/getting-started/quickstart',
    cta: 'Quickstart →',
  },
  {
    number: '3',
    title: 'Subscribe to events',
    description: 'Register a webhook endpoint and receive alerts, route changes, and load updates.',
    href: '/docs/webhooks',
    cta: 'Webhook docs →',
  },
];

export function DocsHome() {
  return (
    <div className="not-prose">
      {/* Hero */}
      <div className="mb-16 pt-8">
        <div className="mb-2 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Staging &middot; v1
        </div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
          Build with SALLY
        </h1>
        <p className="mb-8 max-w-xl text-base text-muted-foreground md:text-lg">
          Route planning, HOS compliance, real-time alerts, and webhook events — all via REST API. Ship fleet
          integrations faster.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/developer/api-keys"
            className="inline-flex items-center justify-center rounded-md bg-foreground px-6 py-3 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Get API Keys
          </Link>
          <Link
            href="/docs/api-playground"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            View API Reference
          </Link>
        </div>
      </div>

      {/* 3-step onboarding */}
      <div className="mb-16">
        <h2 className="mb-6 text-lg font-semibold text-foreground">Get started in 3 steps</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Link
              key={step.number}
              href={step.href}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-muted/40"
            >
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-sm font-bold text-background">
                {step.number}
              </div>
              <h3 className="mb-1 text-sm font-semibold text-foreground">{step.title}</h3>
              <p className="mb-3 text-xs text-muted-foreground leading-relaxed">{step.description}</p>
              <span className="text-xs font-medium text-foreground group-hover:underline">{step.cta}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* What you can build */}
      <div className="mb-16">
        <h2 className="mb-6 text-lg font-semibold text-foreground">What you can build</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link
                key={feature.title}
                href={feature.href}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-muted/40"
              >
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <h3 className="mb-1 text-sm font-semibold text-foreground">{feature.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
