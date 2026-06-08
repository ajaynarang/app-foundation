'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Progress } from '@sally/ui/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import { Alert, AlertTitle, AlertDescription } from '@sally/ui/components/ui/alert';
import {
  Bot,
  Cloud,
  ExternalLink,
  Fuel,
  Mail,
  MapPin,
  MessageSquare,
  Navigation,
  Phone,
  Shield,
  Truck,
  TrafficCone,
  CircleDollarSign,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Plug,
  HelpCircle,
  Wallet,
  TrendingDown,
  type LucideIcon,
} from 'lucide-react';
import { apiClient } from '@/shared/lib/api';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { showSuccess, showError } from '@/shared/lib/toast';
import type { ServiceBalance, PlatformServiceStatus } from '@sally/shared-types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------- types ----------

/** Extends shared PlatformServiceStatus — used as the API response type */
type ServiceHealth = PlatformServiceStatus;

type ServiceCategory = 'ai' | 'voice' | 'auth' | 'communication' | 'mapping' | 'storage' | 'integrations';
type FilterTab = 'all' | 'platform' | 'integrations' | 'at_risk';

interface ServiceMeta {
  label: string;
  icon: LucideIcon;
  description: string;
  category: ServiceCategory;
  provider: string;
  ownership: 'platform' | 'tenant';
  /** How we check health — shown in the detail sheet */
  healthNote?: string;
  /** How we check balance/cost — shown in the detail sheet */
  costNote?: string;
}

// ---------- service registry ----------

const SERVICE_META: Record<string, ServiceMeta> = {
  // AI & Intelligence
  anthropic: {
    label: 'Anthropic Claude',
    icon: Bot,
    description: 'Primary LLM — Sally AI, document intelligence, rate-con parsing, moderation',
    category: 'ai',
    provider: 'Anthropic',
    ownership: 'platform',
    healthNote: 'Pings GET /v1/models every ~5 min — free endpoint that validates your API key is active.',
    costNote: 'No balance API available. Check console.anthropic.com for credit balance and usage.',
  },
  aiGateway: {
    label: 'Vercel AI Gateway',
    icon: Bot,
    description: 'LLM routing proxy and embeddings (text-embedding-3-small)',
    category: 'ai',
    provider: 'Vercel',
    ownership: 'platform',
    healthNote: 'Health tracked via LLM calls routed through the gateway — no standalone ping.',
    costNote: 'Check Vercel dashboard for AI Gateway usage and costs.',
  },
  openai: {
    label: 'OpenAI',
    icon: MessageSquare,
    description: 'Content moderation API — toxicity and safety filtering',
    category: 'ai',
    provider: 'OpenAI',
    ownership: 'platform',
    healthNote: 'Pings GET /v1/organization/costs every ~5 min — validates API key and org access.',
    costNote: 'Pulls monthly spend from the Organization Costs API. Requires org-level API key for billing data.',
  },
  langfuse: {
    label: 'Langfuse',
    icon: Bot,
    description: 'LLM observability — prompt versioning, trace analytics, cost tracking',
    category: 'ai',
    provider: 'Langfuse',
    ownership: 'platform',
    healthNote: 'Pings GET /api/public/health every ~5 min — dedicated health check endpoint.',
    costNote: 'Self-hosted instance — no balance concept. Check Langfuse dashboard for LLM cost tracking.',
  },
  // Voice Agent
  livekit: {
    label: 'LiveKit',
    icon: Phone,
    description: 'Real-time voice infrastructure for voice agents',
    category: 'voice',
    provider: 'LiveKit',
    ownership: 'platform',
    healthNote: 'Sends HEAD request to the LiveKit server URL every ~5 min to verify reachability.',
    costNote: 'No balance API. Check cloud.livekit.io for usage and billing.',
  },
  deepgram: {
    label: 'Deepgram',
    icon: MessageSquare,
    description: 'Speech-to-text — driver and dispatcher voice transcription',
    category: 'voice',
    provider: 'Deepgram',
    ownership: 'platform',
    healthNote: 'Pings GET /v1/projects/{id}/balances every ~5 min — validates key and fetches credit balance.',
    costNote: 'Pulls remaining credits from the Deepgram Balances API. Project ID cached for 1 hour.',
  },
  cartesia: {
    label: 'Cartesia',
    icon: MessageSquare,
    description: 'Text-to-speech — Sally AI voice output',
    category: 'voice',
    provider: 'Cartesia',
    ownership: 'platform',
    healthNote: 'Pings GET /voices every ~5 min — validates API key is active.',
    costNote: 'No balance API. Check play.cartesia.ai for usage.',
  },
  // Authentication
  firebaseAuth: {
    label: 'Firebase Auth',
    icon: Shield,
    description: 'Identity management — JWT tokens, user accounts',
    category: 'auth',
    provider: 'Google',
    ownership: 'platform',
    healthNote: "Config-based — Firebase Admin SDK initializes at startup. If credentials are set, it's healthy.",
    costNote: 'Usage-based via GCP billing. Check Firebase Console for auth usage stats.',
  },
  turnstile: {
    label: 'Cloudflare Turnstile',
    icon: Shield,
    description: 'Bot protection on registration and login forms',
    category: 'auth',
    provider: 'Cloudflare',
    ownership: 'platform',
    healthNote: 'Client-side only — Turnstile runs in the browser, no server-side health ping possible.',
    costNote: 'Free tier. No balance concept.',
  },
  // Communication
  twilio: {
    label: 'Twilio Verify',
    icon: Phone,
    description: 'OTP/SMS — phone verification for driver and dispatcher auth',
    category: 'communication',
    provider: 'Twilio',
    ownership: 'platform',
    healthNote: 'Pings GET /Accounts/{sid}/Balance.json every ~5 min — validates credentials and fetches balance.',
    costNote: 'Pulls real-time account balance in USD from the Twilio Balance API.',
  },
  resend: {
    label: 'Resend',
    icon: Mail,
    description: 'Transactional emails — invitations, confirmations, notifications',
    category: 'communication',
    provider: 'Resend',
    ownership: 'platform',
    healthNote: 'Pings GET /domains every ~5 min — validates API key is active.',
    costNote: 'No usage API available. Check resend.com/settings/billing for email quota and usage.',
  },
  // Mapping & Routing
  weather: {
    label: 'OpenWeather',
    icon: Cloud,
    description: 'Route weather forecasts and road conditions',
    category: 'mapping',
    provider: 'OpenWeather',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'Free tier for current usage. No balance API.',
  },
  fuelPrices: {
    label: 'Fuel Prices',
    icon: Fuel,
    description: 'Station-level fuel pricing data',
    category: 'mapping',
    provider: 'GasBuddy',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'No balance API available.',
  },
  routing: {
    label: 'HERE Routing',
    icon: Navigation,
    description: 'Truck-legal route calculation and directions',
    category: 'mapping',
    provider: 'HERE',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'Shared HERE API key. Check platform.here.com for usage across all HERE services.',
  },
  geocoding: {
    label: 'HERE Geocoding',
    icon: MapPin,
    description: 'Address-to-coordinate resolution',
    category: 'mapping',
    provider: 'HERE',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'Shared HERE API key. Check platform.here.com for usage.',
  },
  mileage: {
    label: 'Trimble PCMiler',
    icon: Truck,
    description: 'Rated miles and truck distance calculation',
    category: 'mapping',
    provider: 'Trimble',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'No balance API. Check developer.trimblemaps.com for usage.',
  },
  traffic: {
    label: 'HERE Traffic',
    icon: TrafficCone,
    description: 'Live traffic flow and incident data',
    category: 'mapping',
    provider: 'HERE',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'Shared HERE API key. Check platform.here.com for usage.',
  },
  tolls: {
    label: 'HERE Tolls',
    icon: CircleDollarSign,
    description: 'Route toll cost estimation',
    category: 'mapping',
    provider: 'HERE',
    ownership: 'platform',
    healthNote: 'Tracked automatically — every real API call records response time and errors.',
    costNote: 'Shared HERE API key. Check platform.here.com for usage.',
  },
  // Storage
  s3: {
    label: 'AWS S3',
    icon: Cloud,
    description: 'Document storage — rate-cons, fuel receipts, uploads',
    category: 'storage',
    provider: 'AWS',
    ownership: 'platform',
    healthNote:
      'Sends HEAD request to the S3 bucket every ~5 min. A 403 (access denied) means the bucket exists and credentials work.',
    costNote: 'No balance concept — S3 is usage-based. Check AWS Cost Explorer for storage costs.',
  },
  // Tenant Integrations (OAuth — tenant provides credentials)
  samsara: {
    label: 'Samsara ELD',
    icon: Truck,
    description: 'Fleet telematics — GPS, HOS, driver behavior',
    category: 'integrations',
    provider: 'Samsara',
    ownership: 'tenant',
  },
  motive: {
    label: 'Motive ELD',
    icon: Truck,
    description: 'ELD/HOS data sync',
    category: 'integrations',
    provider: 'Motive',
    ownership: 'tenant',
  },
  quickbooks: {
    label: 'QuickBooks Online',
    icon: CircleDollarSign,
    description: 'Accounting sync — invoices, payments',
    category: 'integrations',
    provider: 'Intuit',
    ownership: 'tenant',
  },
  dat: {
    label: 'DAT Load Board',
    icon: Plug,
    description: 'Freight marketplace — load search, matching',
    category: 'integrations',
    provider: 'DAT',
    ownership: 'tenant',
  },
  project44: {
    label: 'Project44 TMS',
    icon: Plug,
    description: 'Load, driver, vehicle sync',
    category: 'integrations',
    provider: 'Project44',
    ownership: 'tenant',
  },
  mcleod: {
    label: 'McLeod TMS',
    icon: Plug,
    description: 'Load, driver, vehicle sync',
    category: 'integrations',
    provider: 'McLeod',
    ownership: 'tenant',
  },
  tmw: {
    label: 'TMW Systems TMS',
    icon: Plug,
    description: 'Load, driver, vehicle sync',
    category: 'integrations',
    provider: 'Trimble',
    ownership: 'tenant',
  },
};

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ai: 'AI & Intelligence',
  voice: 'Voice Agent',
  auth: 'Auth & Security',
  communication: 'Communication',
  mapping: 'Mapping & Routing',
  storage: 'Storage',
  integrations: 'Tenant Integrations',
};

const STATUS_STYLES: Record<
  string,
  { variant: 'default' | 'muted' | 'destructive' | 'outline' | 'caution'; label: string }
> = {
  healthy: { variant: 'default', label: 'Operational' },
  degraded: { variant: 'caution', label: 'Degraded' },
  down: { variant: 'destructive', label: 'Down' },
  not_configured: { variant: 'outline', label: 'Not Configured' },
  not_monitored: { variant: 'muted', label: 'Not Monitored' },
  tenant_managed: { variant: 'outline', label: 'Tenant-Managed' },
};

const STATUS_PAGE_URL = 'https://app-shore.github.io/sally-status/';

// ---------- helpers ----------

function formatUsd(amount: number | null): string {
  if (amount === null) return '—';
  return `$${amount.toFixed(2)}`;
}

function getDaysRemainingColor(days: number | null): string {
  if (days === null) return 'text-muted-foreground';
  if (days <= 7) return 'text-red-500 dark:text-red-400';
  if (days <= 30) return 'text-yellow-500 dark:text-yellow-400';
  return 'text-green-500 dark:text-green-400';
}

function getDaysRemainingBg(days: number | null): string {
  if (days === null) return '';
  if (days <= 7) return 'bg-red-500/10 dark:bg-red-500/20';
  if (days <= 30) return 'bg-yellow-500/10 dark:bg-yellow-500/20';
  return '';
}

function isAtRisk(service: ServiceHealth): boolean {
  if (service.status === 'down') return true;
  if (service.status === 'degraded') return true;
  const days = service.balance?.daysRemaining;
  if (days !== null && days !== undefined && days <= 14) return true;
  return false;
}

// ---------- skeleton ----------

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-24" />
      </div>
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

// ---------- detail sheet ----------

interface ServiceDetailSheetProps {
  serviceKey: string | null;
  health: ServiceHealth | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ServiceDetailSheet({ serviceKey, health, open, onOpenChange }: ServiceDetailSheetProps) {
  const { formatTimestamp } = useFormatters();
  const queryClient = useQueryClient();
  const meta = serviceKey ? SERVICE_META[serviceKey] : null;

  const refreshMutation = useMutation({
    mutationFn: () =>
      apiClient<{ balance: ServiceBalance }>(`/admin/platform-services/balance/${serviceKey}/refresh`, {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-services-health'] });
      showSuccess('Balance refreshed');
    },
    onError: (err) => {
      showError(extractErrorMessage(err));
    },
  });

  if (!meta) return null;

  const Icon = meta.icon;
  const hasHealthData = !!health;
  const bal = health?.balance;
  const statusStyle = hasHealthData
    ? (STATUS_STYLES[health.status] ?? STATUS_STYLES.not_monitored)
    : meta.ownership === 'tenant'
      ? STATUS_STYLES.tenant_managed
      : STATUS_STYLES.not_monitored;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" pinnable resizable>
        <SheetHeader
          actions={
            health?.dashboardUrl ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(health.dashboardUrl, '_blank', 'noopener,noreferrer')}
              >
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Dashboard
              </Button>
            ) : undefined
          }
        >
          <SheetTitle className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-muted-foreground" />
            {meta.label}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3">
            <Badge variant={statusStyle.variant} className="text-sm">
              {statusStyle.label}
            </Badge>
            {bal?.daysRemaining !== null && bal?.daysRemaining !== undefined && (
              <Badge
                variant={bal.daysRemaining <= 7 ? 'destructive' : bal.daysRemaining <= 30 ? 'caution' : 'default'}
                className="text-sm"
              >
                {bal.daysRemaining}d remaining
              </Badge>
            )}
          </div>

          {/* Info */}
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Description</p>
              <p className="text-sm text-foreground mt-1">{meta.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Provider</p>
                <p className="text-sm font-medium text-foreground mt-1">{health?.provider ?? meta.provider}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Category</p>
                <p className="text-sm text-foreground mt-1">{CATEGORY_LABELS[meta.category]}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Credential Ownership</p>
              <p className="text-sm text-foreground mt-1">
                {meta.ownership === 'platform'
                  ? "Platform — SALLY's API key, shared across all tenants"
                  : 'Tenant — each tenant provides their own OAuth/credentials'}
              </p>
            </div>
          </div>

          {/* How we monitor this service */}
          {(meta.healthNote || meta.costNote) && (
            <div className="space-y-2 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">How We Monitor</h3>
              {meta.healthNote && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Health check</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.healthNote}</p>
                </div>
              )}
              {meta.costNote && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Cost tracking</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{meta.costNote}</p>
                </div>
              )}
            </div>
          )}

          {/* Balance & Cost */}
          {bal && bal.probeStatus !== 'not_configured' && (
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Balance & Cost</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={refreshMutation.isPending}
                  onClick={() => refreshMutation.mutate()}
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
              </div>

              {bal.balanceUsd !== null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Balance</span>
                  <span className="text-sm font-mono font-medium text-foreground">{formatUsd(bal.balanceUsd)}</span>
                </div>
              )}
              {bal.monthlySpendUsd !== null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Monthly Spend</span>
                  <span className="text-sm font-mono text-foreground">{formatUsd(bal.monthlySpendUsd)}</span>
                </div>
              )}
              {bal.dailyBurnRateUsd !== null && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Daily Burn Rate</span>
                  <span className="text-sm font-mono text-foreground">{formatUsd(bal.dailyBurnRateUsd)}/day</span>
                </div>
              )}
              {bal.daysRemaining !== null && (
                <div className={`flex justify-between p-2 rounded-md ${getDaysRemainingBg(bal.daysRemaining)}`}>
                  <span className="text-sm text-muted-foreground">Days Remaining</span>
                  <span className={`text-sm font-mono font-bold ${getDaysRemainingColor(bal.daysRemaining)}`}>
                    {bal.daysRemaining} days
                  </span>
                </div>
              )}
              {bal.planTier && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Plan / Tier</span>
                  <span className="text-sm text-foreground">{bal.planTier}</span>
                </div>
              )}
              {bal.monthlyUsage && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Usage</span>
                  <span className="text-sm font-mono text-foreground">{bal.monthlyUsage}</span>
                </div>
              )}
              {bal.quotaUsedPercent !== null && (
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Quota Used</span>
                    <span className="font-mono text-foreground">{bal.quotaUsedPercent}%</span>
                  </div>
                  <Progress value={bal.quotaUsedPercent} className="h-2" />
                  {bal.quotaLimit && <p className="text-xs text-muted-foreground">{bal.quotaLimit}</p>}
                </div>
              )}
              {bal.probeStatus === 'unsupported' && bal.planTier && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground bg-card p-2 rounded-md">
                  <HelpCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>{bal.planTier}</p>
                </div>
              )}
              {bal.probeStatus === 'failed' && bal.probeError && (
                <div className="flex items-start gap-2 text-sm text-red-500 dark:text-red-400 bg-red-500/10 dark:bg-red-500/20 p-2 rounded-md">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>Probe failed: {bal.probeError}</p>
                </div>
              )}
              {bal.lastProbed && (
                <p className="text-xs text-muted-foreground">Last probed: {formatTimestamp(bal.lastProbed)}</p>
              )}
            </div>
          )}

          {/* Health details */}
          {hasHealthData && (
            <div className="space-y-3 pt-4 border-t border-border">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Health Metrics</h3>
              {health.avgResponseMs !== undefined && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Response</span>
                  <span className="text-sm font-mono text-foreground">{health.avgResponseMs}ms</span>
                </div>
              )}
              {health.lastSuccess && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Last Success</span>
                  <span className="text-sm text-foreground">{formatTimestamp(health.lastSuccess)}</span>
                </div>
              )}
              {health.lastError && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Last Error</span>
                  <span className="text-sm text-foreground">{formatTimestamp(health.lastError)}</span>
                </div>
              )}
              {health.errorCount24h !== undefined && (
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Errors (24h)</span>
                  <span
                    className={`text-sm font-mono ${health.errorCount24h > 0 ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}
                  >
                    {health.errorCount24h}
                  </span>
                </div>
              )}
              {health.lastErrorMessage && (
                <div>
                  <p className="text-sm text-muted-foreground">Last Error Message</p>
                  <p className="text-xs text-red-500 dark:text-red-400 mt-1 font-mono bg-card p-2 rounded-md">
                    {health.lastErrorMessage}
                  </p>
                </div>
              )}
            </div>
          )}

          {!hasHealthData && (
            <div className="pt-4 border-t border-border">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <HelpCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  {meta.ownership === 'tenant'
                    ? 'Health monitoring is per-tenant. Each tenant manages their own connection in Settings > Integrations.'
                    : 'Health data will appear once this service handles its first request.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- main page ----------

export default function PlatformHealthPage() {
  const [filter, setFilter] = useState<FilterTab>('all');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-services-health'],
    queryFn: () => apiClient<{ services: Record<string, ServiceHealth> }>('/admin/platform-services/health'),
    staleTime: QUERY_TIERS.ACTIVE_POLL.staleTime,
    refetchInterval: 60_000,
  });

  const services = data?.services;
  const backendServices = useMemo<Record<string, ServiceHealth>>(() => services ?? {}, [services]);

  const serviceEntries = useMemo(() => {
    return Object.entries(SERVICE_META).filter(([key, meta]) => {
      if (filter === 'platform') return meta.ownership === 'platform';
      if (filter === 'integrations') return meta.ownership === 'tenant';
      if (filter === 'at_risk') {
        const health = backendServices[key];
        return health ? isAtRisk(health) : false;
      }
      return true;
    });
  }, [filter, backendServices]);

  const stats = useMemo(() => {
    const platform = Object.values(SERVICE_META).filter((m) => m.ownership === 'platform').length;
    const tenant = Object.values(SERVICE_META).filter((m) => m.ownership === 'tenant').length;
    const monitored = Object.keys(backendServices).length;
    const operational = Object.values(backendServices).filter((s) => s.status === 'healthy').length;

    // Cost aggregation
    let totalMonthlySpend = 0;
    let servicesAtRisk = 0;
    let lowestDaysRemaining: number | null = null;

    for (const [key, health] of Object.entries(backendServices)) {
      if (SERVICE_META[key]?.ownership !== 'platform') continue;

      if (health.balance?.monthlySpendUsd) {
        totalMonthlySpend += health.balance.monthlySpendUsd;
      }
      if (isAtRisk(health)) {
        servicesAtRisk++;
      }
      const days = health.balance?.daysRemaining;
      if (days !== null && days !== undefined) {
        if (lowestDaysRemaining === null || days < lowestDaysRemaining) {
          lowestDaysRemaining = days;
        }
      }
    }

    return {
      platform,
      tenant,
      total: platform + tenant,
      monitored,
      operational,
      totalMonthlySpend,
      servicesAtRisk,
      lowestDaysRemaining,
    };
  }, [backendServices]);

  if (isLoading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Service Control Plane</h1>
          <p className="text-muted-foreground mt-1">Platform services and tenant integrations.</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load service health</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{error instanceof Error ? error.message : 'Unexpected error'}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="ml-4 shrink-0">
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Service Control Plane</h1>
          <p className="text-muted-foreground mt-1">
            Health, cost, and balance monitoring for {stats.total} platform services
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(STATUS_PAGE_URL, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Infrastructure Status
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p
              className={`text-2xl font-bold font-mono ${stats.operational === stats.monitored ? 'text-foreground' : 'text-red-500 dark:text-red-400'}`}
            >
              {stats.operational}/{stats.monitored}
            </p>
            <p className="text-xs text-muted-foreground">Operational</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold font-mono text-foreground">{formatUsd(stats.totalMonthlySpend)}</p>
            <p className="text-xs text-muted-foreground">Monthly Spend (est.)</p>
          </CardContent>
        </Card>
        <Card className={stats.servicesAtRisk > 0 ? 'border-red-500/50 dark:border-red-500/30' : ''}>
          <CardContent className="pt-6 text-center">
            <p
              className={`text-2xl font-bold font-mono ${stats.servicesAtRisk > 0 ? 'text-red-500 dark:text-red-400' : 'text-foreground'}`}
            >
              {stats.servicesAtRisk}
            </p>
            <p className="text-xs text-muted-foreground">At Risk</p>
          </CardContent>
        </Card>
        <Card
          className={
            stats.lowestDaysRemaining !== null && stats.lowestDaysRemaining <= 7
              ? 'border-red-500/50 dark:border-red-500/30'
              : stats.lowestDaysRemaining !== null && stats.lowestDaysRemaining <= 30
                ? 'border-yellow-500/50 dark:border-yellow-500/30'
                : ''
          }
        >
          <CardContent className="pt-6 text-center">
            <p className={`text-2xl font-bold font-mono ${getDaysRemainingColor(stats.lowestDaysRemaining)}`}>
              {stats.lowestDaysRemaining !== null ? `${stats.lowestDaysRemaining}d` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">Lowest Runway</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-2xl font-bold font-mono text-foreground">{stats.platform}</p>
            <p className="text-xs text-muted-foreground">Platform Services</p>
          </CardContent>
        </Card>
      </div>

      {/* At-risk alert banner */}
      {stats.servicesAtRisk > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Services need attention</AlertTitle>
          <AlertDescription>
            {stats.servicesAtRisk} service{stats.servicesAtRisk > 1 ? 's are' : ' is'} at risk —
            {stats.lowestDaysRemaining !== null && stats.lowestDaysRemaining <= 14
              ? ` lowest balance runway is ${stats.lowestDaysRemaining} days.`
              : ' check health status below.'}{' '}
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 font-medium underline"
              onClick={() => setFilter('at_risk')}
            >
              Show at-risk services
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Filter Tabs */}
      <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterTab)}>
        <TabsList>
          <TabsTrigger value="all">All ({stats.total})</TabsTrigger>
          <TabsTrigger value="platform">Platform ({stats.platform})</TabsTrigger>
          <TabsTrigger value="integrations">Tenant ({stats.tenant})</TabsTrigger>
          <TabsTrigger value="at_risk" className={stats.servicesAtRisk > 0 ? 'text-red-500 dark:text-red-400' : ''}>
            At Risk ({stats.servicesAtRisk})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead className="hidden sm:table-cell">Category</TableHead>
                <TableHead className="hidden lg:table-cell">Response</TableHead>
                <TableHead className="hidden md:table-cell text-right">Balance / Cost</TableHead>
                <TableHead className="hidden xl:table-cell text-right">Runway</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {serviceEntries.map(([key, meta]) => {
                const health = backendServices[key];
                const hasHealthData = !!health;
                const bal = health?.balance;
                const Icon = meta.icon;
                const statusStyle = hasHealthData
                  ? (STATUS_STYLES[health.status] ?? STATUS_STYLES.not_monitored)
                  : meta.ownership === 'tenant'
                    ? STATUS_STYLES.tenant_managed
                    : STATUS_STYLES.not_monitored;
                const rowAtRisk = health ? isAtRisk(health) : false;

                return (
                  <TableRow
                    key={key}
                    className={`cursor-pointer ${rowAtRisk ? 'bg-red-500/5 dark:bg-red-500/10' : ''}`}
                    onClick={() => {
                      setSelectedService(key);
                      setSheetOpen(true);
                    }}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate">{meta.label}</p>
                          <p className="text-xs text-muted-foreground truncate hidden sm:block">{meta.description}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className="text-sm text-muted-foreground">{CATEGORY_LABELS[meta.category]}</span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {hasHealthData && health.avgResponseMs !== undefined ? (
                        <span className="text-sm font-mono text-foreground">{health.avgResponseMs}ms</span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-right">
                      {bal?.balanceUsd !== null && bal?.balanceUsd !== undefined ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-mono text-foreground">
                              <Wallet className="h-3 w-3 inline mr-1 text-muted-foreground" />
                              {formatUsd(bal.balanceUsd)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Account balance</TooltipContent>
                        </Tooltip>
                      ) : bal?.monthlySpendUsd !== null && bal?.monthlySpendUsd !== undefined ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="text-sm font-mono text-muted-foreground">
                              <TrendingDown className="h-3 w-3 inline mr-1" />
                              {formatUsd(bal.monthlySpendUsd)}/mo
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Monthly spend estimate</TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell text-right">
                      {bal?.daysRemaining !== null && bal?.daysRemaining !== undefined ? (
                        <span className={`text-sm font-mono font-bold ${getDaysRemainingColor(bal.daysRemaining)}`}>
                          {bal.daysRemaining}d
                        </span>
                      ) : bal?.quotaUsedPercent !== null && bal?.quotaUsedPercent !== undefined ? (
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={bal.quotaUsedPercent} className="h-2 w-16" />
                          <span className="text-xs font-mono text-muted-foreground">{bal.quotaUsedPercent}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusStyle.variant}>{statusStyle.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              {serviceEntries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No services match the selected filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <ServiceDetailSheet
        serviceKey={selectedService}
        health={selectedService ? (backendServices[selectedService] ?? null) : null}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedService(null);
        }}
      />
    </div>
  );
}
