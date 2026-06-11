'use client';

import Link from 'next/link';
import { KeyRound, ShieldCheck, Webhook, Bot, Building2, Code2 } from 'lucide-react';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Authentication',
    description: 'Bearer-token auth with API keys and OAuth 2.1. JWT sessions with refresh for first-party apps.',
    href: '/docs/getting-started/authentication',
  },
  {
    icon: KeyRound,
    title: 'API Keys',
    description: 'Create, rotate, and revoke server-to-server keys. Scoped to your tenant with full audit trails.',
    href: '/docs/getting-started/api-keys',
  },
  {
    icon: Webhook,
    title: 'Webhook Events',
    description: 'Subscribe to platform events. HMAC-signed payloads with automatic retry and delivery logs.',
    href: '/docs/webhooks',
  },
  {
    icon: Bot,
    title: 'AI Assistants (MCP)',
    description: 'Connect Claude, ChatGPT, or any MCP client to your workspace via the built-in MCP server.',
    href: '/docs/api-guides/ai-integrations',
  },
  {
    icon: Building2,
    title: 'Multi-tenant',
    description: 'Tenant-scoped data isolation out of the box. Run multi-tenant or single-tenant from one codebase.',
    href: '/docs/getting-started/introduction',
  },
  {
    icon: Code2,
    title: 'REST API',
    description: 'Predictable JSON APIs with consistent errors, pagination, and rate limits. Explore them live.',
    href: '/docs/api-playground',
  },
];

const STEPS = [
  {
    number: '1',
    title: 'Generate an API key',
    description: 'Sign in and create your first key in seconds.',
    href: '/developer/api-keys',
    cta: 'Get API Keys →',
  },
  {
    number: '2',
    title: 'Make your first request',
    description: 'Call the API with your Bearer token and get JSON back.',
    href: '/docs/getting-started/quickstart',
    cta: 'Quickstart →',
  },
  {
    number: '3',
    title: 'Subscribe to events',
    description: 'Register a webhook endpoint and receive platform events in real time.',
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
          v1
        </div>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-foreground md:text-4xl lg:text-5xl">
          Build with the platform
        </h1>
        <p className="mb-8 max-w-xl text-base text-muted-foreground md:text-lg">
          Authentication, multi-tenancy, webhooks, and AI assistant integrations — all via REST API. Ship your
          integration faster.
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
