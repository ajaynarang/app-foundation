import Link from 'next/link';
import {
  Activity,
  Bot,
  BookOpen,
  Building2,
  CreditCard,
  Database,
  Layers,
  LogIn,
  ShieldCheck,
  Workflow,
} from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';

/**
 * Template landing page — the first thing a developer sees after booting the
 * starter. Replace this file with your product's home page (step 5 below).
 *
 * Renders inside PublicLayout (header + footer come from LayoutClient), and
 * `/` is already in the middleware public-route list, so this page is visible
 * to unauthenticated visitors. Authenticated users get a "Go to App" button
 * in the PublicLayout header.
 */

// Branding — the literal "Platform" string is replaced across the repo by `pnpm init-app`.
const APP_NAME = 'Platform';
const TAGLINE = 'Your platform, ready to build on.';
const REPO_URL = 'https://github.com/ajaynarang/app-foundation';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Authentication',
    description: 'Firebase + JWT with refresh tokens, phone OTP, and an OAuth provider.',
  },
  {
    icon: Building2,
    title: 'Multi-tenancy toggle',
    description: 'Run multi- or single-tenant from one codebase via the MULTI_TENANT env.',
  },
  {
    icon: CreditCard,
    title: 'Billing & plans',
    description: 'Stripe subscriptions, wallet, and plan entitlements out of the box.',
  },
  {
    icon: Bot,
    title: 'AI assistant + MCP',
    description: 'Anthropic-powered streaming chat with an empty MCP toolset ready for your tools.',
  },
  {
    icon: Workflow,
    title: 'Background jobs & workflows',
    description: 'BullMQ queues plus Inngest durable workflows.',
  },
  {
    icon: Activity,
    title: 'Observability',
    description: 'OpenTelemetry, Langfuse tracing, and a Loki + Tempo + Grafana stack.',
  },
  {
    icon: Database,
    title: 'Postgres + pgvector',
    description: 'Prisma ORM on PostgreSQL 16 with vector search built in.',
  },
  {
    icon: Layers,
    title: 'Infrastructure as code',
    description: 'Terraform modules for AWS — ECS, RDS, ElastiCache, S3, ALB.',
  },
] as const;

const STEPS: { title: string; description?: string; code?: string }[] = [
  {
    title: 'Instantiate the template',
    description: 'Renames packages, Docker, Terraform, Doppler config, and branding. See tools/init-app/README.md.',
    code: 'pnpm install\npnpm init-app --name my-app --display-name "My App" --yes',
  },
  {
    title: 'Configure secrets',
    description: 'Use Doppler (docs/doppler.md) or plain env files.',
    code: 'cp apps/backend/.env.example apps/backend/.env\ncp apps/web/.env.example apps/web/.env.local',
  },
  {
    title: 'Start infrastructure and seed the database',
    description: 'Postgres (pgvector) and Redis via Docker, then migrate and seed.',
    code: 'pnpm docker:up\ncd apps/backend\npnpm prisma:migrate:deploy && pnpm db:seed',
  },
  {
    title: 'Run the dev servers',
    description: 'Web on localhost:3000, backend on localhost:8000.',
    code: 'pnpm dev',
  },
  {
    title: 'Replace this landing page',
    description: 'apps/web/src/app/page.tsx is yours — swap it for your product’s home.',
  },
];

export default function LandingPage() {
  const isMultiTenant = process.env.NEXT_PUBLIC_MULTI_TENANT !== 'false';

  return (
    <div className="bg-background">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-20 text-center sm:px-6 md:pb-24 md:pt-28">
        <Badge variant="muted" className="mb-6">
          Starter template
        </Badge>
        <h1 className="font-space-grotesk text-4xl font-bold tracking-tight text-foreground md:text-6xl">{APP_NAME}</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{TAGLINE}</p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/login">
            <Button size="lg">
              <LogIn className="mr-2 h-4 w-4" />
              Sign in
            </Button>
          </Link>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="lg">
              <BookOpen className="mr-2 h-4 w-4" />
              Documentation
            </Button>
          </a>
        </div>
      </section>

      {/* ── What's inside ────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">What&apos;s inside</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Everything cross-cutting is already built and wired together — add your domain on top.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => (
              <Card key={feature.title} className="border-border">
                <CardContent className="p-5">
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-muted">
                    <feature.icon className="h-4 w-4 text-foreground" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">{feature.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Make it yours ────────────────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Make it yours</h2>
          <p className="mt-2 text-sm text-muted-foreground">Five steps from clone to your own product.</p>
          <Card className="mt-8 border-border">
            <CardContent className="p-6">
              <ol className="space-y-6">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-4">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-foreground">{step.title}</h3>
                      {step.description && <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>}
                      {step.code && (
                        <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                          {step.code}
                        </pre>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Tenancy mode indicator ───────────────────────────────────────── */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-center gap-2 px-4 py-8 sm:px-6">
          <Badge variant="outline">{isMultiTenant ? 'Multi-tenant mode' : 'Single-tenant mode'}</Badge>
          <span className="text-xs text-muted-foreground">Toggle with NEXT_PUBLIC_MULTI_TENANT / MULTI_TENANT</span>
        </div>
      </section>
    </div>
  );
}
