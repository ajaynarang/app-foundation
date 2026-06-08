'use client';

import { motion, useScroll, useTransform, useInView, animate } from 'framer-motion';
import { useRef, useEffect, useState } from 'react';
import { ThemeAwareImage } from '@/shared/components/common/ThemeAwareImage';
import {
  ArrowRight,
  Zap,
  Link2,
  BarChart3,
  Shield,
  Clock,
  TrendingDown,
  Activity,
  Mail,
  FileSpreadsheet,
  RefreshCw,
  PenLine,
  CheckCircle2,
  ChevronRight,
  Bot,
  MessageSquare,
  Globe,
} from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { mailto } from '@/shared/lib/contacts';
import { DemoVideoSection } from '@/shared/components/common/DemoVideoSection';

const consoleUrl = process.env.NEXT_PUBLIC_CONSOLE_URL || 'http://localhost:3002';

/* ─── Animation Config ─── */

const easeOut = [0.21, 0.47, 0.32, 0.98] as [number, number, number, number];

const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' as const },
  transition: { duration: 0.7, ease: easeOut },
};

/* ─── Data ─── */

const stats = [
  { value: 0, suffix: '', label: 'HOS Violations', icon: Shield },
  { value: 40, suffix: '%', label: 'Less Planning Time', icon: Clock },
  { value: 98, suffix: '%', label: 'On-Time Delivery', icon: TrendingDown },
  { value: 24, suffix: '/7', label: 'Automated Monitoring', icon: Activity },
];

const showcaseSections = [
  {
    src: '/screenshots/dispatcher/tower.png',
    alt: 'SALLY Tower with real-time KPIs, active loads, monitoring status, and shift notes',
    title: 'See everything. Miss nothing.',
    subtitle:
      'Real-time KPIs, active loads, driver status, and shift notes — all in one screen. Your entire operation, distilled.',
    bullets: [
      'Live fleet KPIs update in real time',
      'Active load monitoring with status tracking',
      'Shift notes and team communication',
      'Instant alerts when anything needs attention',
    ],
    badge: 'Command Center',
  },
  {
    src: '/screenshots/dispatcher/sallys-desk.png',
    alt: "Sally's Desk with AI agents — Billing, Compliance, Dispatch — operating across active episodes with supervisor approval",
    title: 'Agents that report to you.',
    subtitle:
      'Billing, Compliance, Dispatch — agents that work in the background, escalate when it matters, and log every action. You stay in charge; SALLY does the rest.',
    bullets: [
      'Specialized agents per discipline — Billing, Compliance, Dispatch',
      'Episodes log every tool call, decision, and handoff',
      'Approval routing — supervisors see what needs a human first',
      'Memory and responsibilities tuned per agent',
    ],
    badge: "Sally's Desk",
  },
  {
    src: '/screenshots/dispatcher/sally-ai-chat.png',
    alt: 'SALLY AI assistant with natural language queries, voice input, and proactive recommendations',
    title: 'Just ask.',
    subtitle:
      'Talk to SALLY like you would a colleague. Ask "what needs my attention?" and get a fleet snapshot, active alerts, and HOS violations — instantly.',
    bullets: [
      'Natural language fleet queries with instant answers',
      'Quick actions: fleet status, compliance, load readiness',
      'Proactive recommendations and violation alerts',
      '20+ integrated MCP tools at your command',
    ],
    badge: 'Sally AI',
  },
  {
    src: '/screenshots/dispatcher/route-detail.png',
    alt: 'Smart Route detail — interactive map, route segments, HOS rest insertion, and fuel stops for a single plan',
    secondarySrc: '/screenshots/dispatcher/plan-route.png',
    secondaryAlt: 'Smart Routes list — active plans with driver assignments, distance, and duration',
    title: 'Routes that respect the clock.',
    subtitle:
      'Plan multi-stop routes with HOS compliance baked in. SALLY inserts mandatory breaks, calculates fuel stops, and flags violations before they happen — segment by segment.',
    bullets: [
      'HOS-aware route optimization',
      'Automatic break and rest insertion',
      'Interactive map with route segments',
      'Compliance report for every plan',
    ],
    badge: 'Route Planning',
  },
  {
    src: '/screenshots/dispatcher/ratecon-import.png',
    alt: 'Import Rate Confirmations dialog with drag-and-drop PDF upload and vision mode',
    title: 'Drop a rate-con. Done.',
    subtitle:
      'Upload a rate confirmation PDF and SALLY extracts every detail — stops, weights, rates, references. No retyping. No mistakes.',
    bullets: [
      'Drag-and-drop PDF upload',
      'AI-powered field extraction',
      'Vision mode for scanned documents',
      'Loads appear in Drafts automatically',
    ],
    badge: 'Document Intelligence',
  },
  {
    src: '/screenshots/dispatcher/loads.png',
    alt: 'Loads board with Kanban view showing Drafts, Pending, Assigned, and In Transit columns',
    title: 'Every load, at a glance.',
    subtitle:
      'A visual Kanban board that mirrors how you actually think about loads. Drag, filter, and track — from draft to delivered.',
    bullets: [
      'Visual pipeline: Drafts, Pending, Assigned, In Transit',
      'Instant search across loads, customers, and drivers',
      'Import from rate-cons, CSV, EDI, or load boards',
      'Continuous load flow from TMS and EDI partners',
    ],
    badge: 'Loads Board',
  },
  {
    src: '/screenshots/dispatcher/inbox.png',
    alt: 'Inbox — emails, tenders, and load-board offers in one queue',
    secondarySrc: '/screenshots/dispatcher/horizon.png',
    secondaryAlt: 'Horizon — week-ahead view of planned work, capacity, and gaps',
    title: 'Inbound today, plans for the week.',
    subtitle:
      'Inbox triages every email, tender, and offer in one queue. Horizon zooms out — what loads are running, who can take them, where the gaps are.',
    bullets: [
      'Email and tender ingestion in a single Inbox',
      'Smart load-board scanning with relevance ranking',
      'Horizon — week-ahead capacity and load schedule',
      'Drag from Horizon to assign drivers and equipment',
    ],
    badge: 'Plan the Day',
  },
  {
    src: '/screenshots/dispatcher/fleet.png',
    alt: 'Fleet management showing 17 drivers with HOS hours, compliance status, and Samsara ELD integration',
    secondarySrc: '/screenshots/dispatcher/fleet-assets.png',
    secondaryAlt: 'Fleet assets tab showing trucks, trailers, and equipment with status and telematics',
    title: 'One source of truth.',
    subtitle:
      'Drivers, trucks, trailers, equipment — synced directly from your ELD like Samsara. Live HOS data for every driver. No more spreadsheets.',
    bullets: [
      'ELD integration — Samsara syncs drivers, vehicles, and HOS',
      'Trucks, trailers, and equipment tracking',
      'Live HOS hours and compliance status per driver',
      'Manual entry when you need full control',
    ],
    badge: 'Fleet Management',
  },
  {
    src: '/screenshots/dispatcher/shield.png',
    alt: 'Shield compliance engine with 66/100 score, HOS 100/100, Vehicles 100/100, Loads 70/100',
    title: 'Compliance that never sleeps.',
    subtitle:
      'Automated audits score your fleet across HOS, vehicles, and loads. Every finding comes with a clear path to resolution.',
    bullets: [
      'Composite compliance score at a glance',
      'HOS, vehicle, and load sub-scores',
      'Automated findings with severity levels',
      'Resolution tracking and audit history',
    ],
    badge: 'Shield',
  },
  {
    src: '/screenshots/dispatcher/billing.png',
    alt: 'Billing dashboard with outstanding, overdue, paid this month KPIs and invoice table',
    title: 'Close-out in clicks, not days.',
    subtitle:
      'Generate invoices from completed loads, track payments, and manage settlements — the entire billing lifecycle in one view.',
    bullets: [
      'Outstanding, overdue, and paid-this-month KPIs',
      'One-click invoice generation from loads',
      'Payment tracking and aging reports',
      'Driver settlement and deduction management',
    ],
    badge: 'Settlements & Billing',
  },
  {
    src: '/screenshots/dispatcher/ifta.png',
    alt: 'IFTA reporting — fuel-tax filings auto-generated from miles by jurisdiction',
    title: 'IFTA, without the spreadsheet.',
    subtitle:
      'Fuel-tax filings, auto-prepared from your route miles and fuel purchases. Quarter-end becomes a click, not a Friday night.',
    bullets: [
      'Miles-by-jurisdiction calculated from completed routes',
      'Fuel purchases pulled from your fuel-card integration',
      'Quarterly returns auto-generated, ready to file',
      'Audit trail per trip — defensible numbers',
    ],
    badge: 'IFTA Reporting',
  },
  {
    src: '/screenshots/dispatcher/alerts.png',
    alt: 'Proactive alerts dashboard with HOS violations, loads at risk, and resolution tracking',
    title: 'Know before it happens.',
    subtitle:
      'SALLY monitors your fleet 24/7 and surfaces issues before they become problems. HOS limits, fuel, dock delays — every alert comes with context and a resolution path.',
    bullets: [
      'Real-time driver and load alert monitoring',
      'HOS violation detection with time remaining',
      'Severity-based prioritization',
      'One-click resolve, acknowledge, or escalate',
    ],
    badge: 'Proactive Alerts',
  },
  {
    src: '/screenshots/dispatcher/settings.png',
    alt: 'SALLY Settings with integrations, team management, API keys, and webhooks',
    title: 'Configure everything.',
    subtitle:
      'Manage integrations, team members, API keys, and operational settings — all from one screen. Connect your ELD, accounting, and fuel card systems in minutes.',
    bullets: [
      'ELD and accounting integration setup',
      'Team roles and access control',
      'Operational preferences and defaults',
      'MCP connectors for AI assistants',
    ],
    badge: 'Settings',
  },
];

const loadIngestionMethods = [
  {
    icon: PenLine,
    title: 'Manual Entry',
    description:
      'Full control when you need it. Create loads with a clean form — stops, weight, equipment, all in one place.',
  },
  {
    icon: Mail,
    title: 'Email Parsing',
    description: 'Forward rate confirmations to SALLY. Details are extracted automatically — zero retyping.',
  },
  {
    icon: FileSpreadsheet,
    title: 'CSV Import',
    description: 'Drag and drop a spreadsheet. Hundreds of loads ingested in seconds with smart field mapping.',
  },
  {
    icon: RefreshCw,
    title: 'TMS Sync',
    description: 'Connect your TMS and loads flow in continuously. Always in sync, always up to date.',
  },
];

const steps = [
  {
    number: '01',
    icon: Link2,
    title: 'Connect',
    description: 'Link your TMS, ELD, and integrations. SALLY syncs your drivers, vehicles, and loads automatically.',
  },
  {
    number: '02',
    icon: Zap,
    title: 'Dispatch',
    description:
      'Create loads, assign drivers, and plan routes. SALLY handles HOS compliance, fuel stops, and optimization.',
  },
  {
    number: '03',
    icon: BarChart3,
    title: 'Monitor',
    description:
      'Real-time dashboards, proactive alerts, and AI-powered insights keep your fleet running at peak performance.',
  },
];

const integrations = [
  { label: 'ELD / Samsara', description: 'Live HOS and telematics' },
  { label: 'TMS Systems', description: 'Load and dispatch sync' },
  { label: 'Fuel APIs', description: 'Real-time fuel pricing' },
  { label: 'Weather Services', description: 'Route condition alerts' },
  { label: 'QuickBooks', description: 'Invoicing and settlements' },
];

const aiPlatforms = [
  {
    icon: MessageSquare,
    name: 'Claude',
    description: "Anthropic's AI assistant. Paste your connector URL and start managing your fleet.",
    tag: 'MCP Connector',
  },
  {
    icon: Bot,
    name: 'ChatGPT',
    description: 'Connect SALLY as an MCP app in ChatGPT. Add your server URL and sign in.',
    tag: 'MCP App',
  },
  {
    icon: Globe,
    name: 'Any MCP Client',
    description: 'Open protocol. Connect any MCP-compatible tool to SALLY.',
    tag: 'Open Standard',
  },
];

/* ─── Animated Counter Component ─── */

function AnimatedCounter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });
  const [display, setDisplay] = useState('0');

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(0, value, {
      duration: 1.8,
      ease: easeOut,
      onUpdate: (v) => setDisplay(Math.round(v).toString()),
    });
    return () => controls.stop();
  }, [isInView, value]);

  return (
    <span ref={ref}>
      {display}
      {suffix}
    </span>
  );
}

/* ─── Pulsing Live Dot ─── */

function LiveDot() {
  return (
    <span className="relative inline-flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500/40" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
      </span>
      <span className="text-xs font-medium text-emerald-500 tracking-wider uppercase">Live</span>
    </span>
  );
}

/* ─── Browser Chrome Frame ─── */

function BrowserFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card shadow-2xl overflow-hidden ${className || ''}`}>
      {/* Title bar */}
      <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500/20 dark:bg-red-500/30" />
          <div className="w-3 h-3 rounded-full bg-yellow-500/20 dark:bg-yellow-500/30" />
          <div className="w-3 h-3 rounded-full bg-green-500/20 dark:bg-green-500/30" />
        </div>
        <div className="flex-1 mx-8">
          <div className="h-6 rounded-md bg-muted/80 dark:bg-muted max-w-xs mx-auto flex items-center justify-center">
            <span className="text-2xs text-muted-foreground/60 font-mono">sally.appshore.in</span>
          </div>
        </div>
        <div className="w-12" />
      </div>
      {/* Content */}
      {children}
    </div>
  );
}

/* ─── Phone Frame ─── */

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto ${className || ''}`} style={{ maxWidth: 320 }}>
      {/* Phone outer shell */}
      <div className="relative rounded-[2.5rem] border-[6px] border-foreground/10 dark:border-foreground/15 bg-card shadow-2xl overflow-hidden">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-foreground/10 dark:bg-foreground/15 rounded-b-2xl z-10" />
        {/* Screen content */}
        <div className="relative overflow-hidden rounded-[2rem]">{children}</div>
      </div>
    </div>
  );
}

/* ─── Showcase Section ─── */

function ShowcaseSection({ section, index }: { section: (typeof showcaseSections)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [50, -50]);
  const isReversed = index % 2 === 1;
  const isDriverSection = section.badge === 'Driver Experience';
  const hasSecondary = 'secondarySrc' in section && section.secondarySrc;

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 60 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.9, ease: easeOut }}
      className={`flex flex-col ${isReversed ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-10 lg:gap-20`}
    >
      {/* Screenshot */}
      <motion.div style={{ y }} className="flex-1 w-full min-w-0">
        {isDriverSection ? (
          <PhoneFrame>
            <ThemeAwareImage
              src={section.src}
              alt={section.alt}
              width={390}
              height={844}
              className="w-full h-auto"
              quality={90}
            />
          </PhoneFrame>
        ) : (
          <div className="space-y-4">
            <motion.div whileHover={{ scale: 1.01, transition: { duration: 0.3 } }}>
              <BrowserFrame>
                <ThemeAwareImage
                  src={section.src}
                  alt={section.alt}
                  width={1920}
                  height={1080}
                  className="w-full h-auto"
                  quality={90}
                />
              </BrowserFrame>
            </motion.div>
            {hasSecondary && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3, ease: easeOut }}
                whileHover={{ scale: 1.01, transition: { duration: 0.3 } }}
              >
                <BrowserFrame>
                  <ThemeAwareImage
                    src={section.secondarySrc!}
                    alt={section.secondaryAlt!}
                    width={1920}
                    height={1080}
                    className="w-full h-auto"
                    quality={90}
                  />
                </BrowserFrame>
              </motion.div>
            )}
          </div>
        )}
      </motion.div>

      {/* Text content */}
      <motion.div
        initial={{ opacity: 0, x: isReversed ? -30 : 30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.7, delay: 0.2, ease: easeOut }}
        className="flex-1 w-full lg:max-w-md"
      >
        <Badge variant="muted" className="mb-4 text-xs tracking-wider uppercase">
          {section.badge}
        </Badge>
        <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight leading-tight">
          {section.title}
        </h3>
        <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-6">{section.subtitle}</p>
        <ul className="space-y-3">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-foreground/40 mt-0.5 shrink-0" />
              <span className="text-sm text-muted-foreground">{bullet}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
}

/* ─── Animated Step Connector ─── */

function StepConnector() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: '-40px' });

  return (
    <div ref={ref} className="hidden md:block absolute top-8 left-[calc(50%+40px)] right-0 h-px overflow-hidden">
      <motion.div
        className="h-full bg-border"
        initial={{ scaleX: 0 }}
        animate={isInView ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.8, delay: 0.3, ease: easeOut }}
        style={{ transformOrigin: 'left' }}
      />
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Page
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function ProductPage() {
  return (
    <div className="bg-background overflow-hidden">
      {/* ━━━ Hero ━━━ */}
      <section className="relative px-4 md:px-6 lg:px-8 pt-20 md:pt-32 pb-16 md:pb-24 max-w-6xl mx-auto text-center">
        {/* Ambient gradient orbs */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <motion.div
            className="absolute top-1/4 left-1/4 w-[600px] h-[500px] bg-muted/40 rounded-full blur-3xl"
            animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-1/2 right-1/4 w-[500px] h-[600px] bg-muted/30 rounded-full blur-3xl"
            animate={{ x: [0, -35, 0], y: [0, 20, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: easeOut }}
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <Badge variant="muted" className="text-xs tracking-wider uppercase">
              AI-Native Fleet Operations
            </Badge>
            <LiveDot />
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-foreground tracking-tight leading-[1.08]">
            Your fleet&apos;s
            <br />
            <motion.span
              className="bg-clip-text text-transparent bg-gradient-to-r from-foreground via-foreground/80 to-muted-foreground bg-[length:200%_auto]"
              animate={{
                backgroundPosition: ['0% center', '100% center', '0% center'],
              }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
            >
              nervous system
            </motion.span>
          </h1>

          <motion.p
            className="mt-6 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            AI-powered dispatching, real-time compliance, and proactive fleet monitoring — so your team can stop
            firefighting and start operating.
          </motion.p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.6, ease: easeOut }}
          className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <a href="/register">
            <Button size="lg" className="text-base px-8 py-6 group">
              Get Started
              <motion.span
                className="inline-block ml-2"
                animate={{ x: [0, 4, 0] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                <ArrowRight className="h-4 w-4" />
              </motion.span>
            </Button>
          </a>
          <a href={mailto('sally')}>
            <Button variant="outline" size="lg" className="text-base px-8 py-6">
              Request a Demo
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </a>
        </motion.div>
      </section>

      {/* ━━━ Demo Video ━━━ */}
      <DemoVideoSection />

      {/* ━━━ Social Proof Stats ━━━ */}
      <section className="px-4 md:px-6 lg:px-8 py-16 md:py-20 border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.5, delay: i * 0.1, ease: easeOut }}
              className="text-center"
            >
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground/5 dark:bg-foreground/10 mb-3">
                <stat.icon className="h-5 w-5 text-foreground" />
              </div>
              <p className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
                <AnimatedCounter value={stat.value} suffix={stat.suffix} />
              </p>
              <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ━━━ Product Showcase — 6 Alternating Sections ━━━ */}
      <section className="px-4 md:px-6 lg:px-8 py-20 md:py-32 max-w-7xl mx-auto">
        <motion.div {...fadeInUp} className="text-center mb-16 md:mb-24">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
            Built for how you
            <br className="hidden md:block" /> actually dispatch
          </h2>
          <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
            Every screen designed to reduce cognitive load, surface what matters, and let AI handle the rest.
          </p>
        </motion.div>

        <div className="space-y-24 md:space-y-40">
          {showcaseSections.map((section, i) => (
            <ShowcaseSection key={section.badge} section={section} index={i} />
          ))}

          {/* Driver Experience — 5 phones in a responsive carousel (snap-scroll on mobile, row on desktop) */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-100px' }}
            transition={{ duration: 0.9, ease: easeOut }}
          >
            {/* Text centered above */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.7, ease: easeOut }}
              className="text-center max-w-2xl mx-auto mb-12 md:mb-16"
            >
              <Badge variant="muted" className="mb-4 text-xs tracking-wider uppercase">
                Driver Experience
              </Badge>
              <h3 className="text-3xl md:text-4xl font-bold text-foreground mb-4 tracking-tight leading-tight">
                Built for the road.
              </h3>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed mb-6">
                A mobile experience designed for one-handed use in the cab. HOS at a glance, load details,
                communication, and SALLY AI — all from the driver&apos;s pocket.
              </p>
              <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
                {['HOS at a glance', 'Load details & navigation', 'Dispatch messaging', 'Voice-powered Sally AI'].map(
                  (bullet) => (
                    <li key={bullet} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-foreground/40 shrink-0" />
                      <span className="text-sm text-muted-foreground">{bullet}</span>
                    </li>
                  ),
                )}
              </ul>
            </motion.div>

            {/* Driver phones — horizontal snap-scroll on mobile, single row on desktop */}
            <div className="flex md:flex-row items-center md:justify-center gap-6 md:gap-4 lg:gap-6 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none px-4 md:px-0 pb-6 md:pb-0">
              {[
                {
                  src: '/screenshots/driver/trip.png',
                  alt: 'Driver trip — active load, recent loads, and HOS break status at a glance',
                  label: 'Trip',
                },
                {
                  src: '/screenshots/driver/me.png',
                  alt: 'Driver profile — weekly loads, miles, earnings, navigation and safety preferences',
                  label: 'Me',
                },
                {
                  src: '/screenshots/driver/sally-ai.png',
                  alt: 'Driver Sally AI — voice input, recommendations, route help',
                  label: 'Sally AI',
                },
              ].map((phone, i) => (
                <motion.div
                  key={phone.label}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.7, delay: i * 0.1, ease: easeOut }}
                  className="text-center flex-shrink-0 snap-center"
                >
                  <PhoneFrame className={i === 2 ? 'md:-mt-4' : ''}>
                    <ThemeAwareImage
                      src={phone.src}
                      alt={phone.alt}
                      width={390}
                      height={844}
                      className="w-full h-auto"
                      quality={90}
                    />
                  </PhoneFrame>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">{phone.label}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ━━━ Your Loads, Your Way ━━━ */}
      <section className="px-4 md:px-6 lg:px-8 py-20 md:py-28 border-y border-border bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="muted" className="mb-4 text-xs tracking-wider uppercase">
              Load Ingestion
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
              Your loads, your way
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Four ways in. Zero friction. Whether you type it, forward it, upload it, or sync it — SALLY handles the
              rest.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {loadIngestionMethods.map((method, i) => (
              <motion.div
                key={method.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, delay: i * 0.12, ease: easeOut }}
              >
                <Card className="h-full text-center group hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  <CardContent className="pt-8 pb-6">
                    <motion.div
                      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground text-background mb-5"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <method.icon className="h-6 w-6" />
                    </motion.div>
                    <h3 className="text-lg font-bold text-foreground mb-2">{method.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                      {method.description}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ How It Works ━━━ */}
      <section className="px-4 md:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
              Up and running in three steps
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Connect your systems, dispatch with confidence, and let SALLY handle the rest.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, delay: i * 0.15, ease: easeOut }}
                className="relative"
              >
                {i < steps.length - 1 && <StepConnector />}

                <div className="text-center">
                  <motion.div
                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-foreground text-background mb-5"
                    whileHover={{ scale: 1.1 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                  >
                    <step.icon className="h-7 w-7" />
                  </motion.div>
                  <p className="text-xs font-mono text-muted-foreground mb-2 tracking-widest uppercase">
                    Step {step.number}
                  </p>
                  <h3 className="text-xl font-bold text-foreground mb-3">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ━━━ Integrations Strip ━━━ */}
      <section className="px-4 md:px-6 lg:px-8 py-16 md:py-20 border-t border-border bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground tracking-tight">Connects to your stack</h2>
            <p className="mt-3 text-muted-foreground">Plug into the systems your fleet already runs on.</p>
          </motion.div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {integrations.map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.08, ease: easeOut }}
              >
                <Card className="text-center hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                  <CardContent className="pt-6 pb-5">
                    <p className="font-medium text-foreground text-sm">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8">
            <a href={`${consoleUrl}/docs`}>
              <Button variant="outline">
                Explore API Docs
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ━━━ Works Where You Work — AI Platforms ━━━ */}
      <section className="px-4 md:px-6 lg:px-8 py-20 md:py-28">
        <div className="max-w-5xl mx-auto">
          <motion.div {...fadeInUp} className="text-center mb-16">
            <Badge variant="muted" className="mb-4 text-xs tracking-wider uppercase">
              Works Where You Work
            </Badge>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
              Your fleet, from any AI
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              Already use Claude or ChatGPT? Connect SALLY and manage loads, invoices, compliance, and routes — without
              switching tabs.
            </p>
          </motion.div>

          {/* Platform cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {aiPlatforms.map((platform, i) => (
              <motion.div
                key={platform.name}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.6, delay: i * 0.12, ease: easeOut }}
              >
                <Card className="h-full group hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                  <CardContent className="pt-8 pb-6">
                    <motion.div
                      className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-foreground text-background mb-5"
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: 'spring', stiffness: 300 }}
                    >
                      <platform.icon className="h-6 w-6" />
                    </motion.div>
                    <Badge variant="muted" className="mb-3 text-2xs tracking-wider uppercase">
                      {platform.tag}
                    </Badge>
                    <h3 className="text-lg font-bold text-foreground mb-2">{platform.name}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{platform.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* Capabilities strip */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.3, ease: easeOut }}
            className="mt-12 flex flex-wrap justify-center gap-3"
          >
            {[
              'Query loads',
              'Fleet status',
              'Generate invoices',
              'Compliance scores',
              'Plan routes',
              'Driver pay',
              'Record payments',
              'Alerts',
            ].map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 dark:bg-muted text-xs font-medium text-muted-foreground"
              >
                <CheckCircle2 className="h-3 w-3" />
                {tool}
              </span>
            ))}
          </motion.div>

          <div className="text-center mt-10">
            <a href={`${consoleUrl}/docs/api-guides/ai-integrations`}>
              <Button variant="outline">
                View Setup Guides
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ━━━ Bottom CTA ━━━ */}
      <section className="relative px-4 md:px-6 lg:px-8 py-24 md:py-36 text-center overflow-hidden">
        {/* Ambient backdrop */}
        <div className="absolute inset-0 -z-10">
          <motion.div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-muted/40 rounded-full blur-3xl"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.3, 0.5, 0.3],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.8, ease: easeOut }}
          className="max-w-3xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight leading-tight">
            See SALLY in action
          </h2>
          <p className="mt-5 text-lg text-muted-foreground max-w-lg mx-auto">
            Join the next generation of fleet operations. Book a 20-minute demo and see how SALLY transforms dispatching
            from reactive firefighting to proactive confidence.
          </p>
          <motion.div
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2, duration: 0.6, ease: easeOut }}
          >
            <a href={mailto('sally')}>
              <Button size="lg" className="text-base px-8 py-6 group">
                Request a Demo
                <motion.span
                  className="inline-block ml-2"
                  animate={{ x: [0, 4, 0] }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <ArrowRight className="h-4 w-4" />
                </motion.span>
              </Button>
            </a>
            <a href={mailto('sally', 'Sales Inquiry')}>
              <Button variant="outline" size="lg" className="text-base px-8 py-6">
                Talk to Sales
              </Button>
            </a>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}
