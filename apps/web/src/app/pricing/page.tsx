import Link from 'next/link';
import {
  Check,
  Minus,
  ArrowRight,
  Sparkles,
  Truck,
  Building2,
  Zap,
  ShieldCheck,
  Route,
  FileText,
  Home,
  Fuel,
  Activity,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { mailto } from '@/shared/lib/contacts';
import type { PlanConfig, PlanEntitlement } from '@/features/platform/plans';
import type { AddOn } from '@sally/shared-types';
import { formatPriceCents, isAddOnFeature } from '@sally/shared-types';

// ---------------------------------------------------------------------------
// SSR data fetch
// ---------------------------------------------------------------------------
async function getPlans(): Promise<PlanConfig[]> {
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/plans`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function getAddOns(): Promise<AddOn[]> {
  try {
    const baseUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/+$/, '');
    const res = await fetch(`${baseUrl}/add-ons`, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Entitlement category config — controls grouping and display order
// ---------------------------------------------------------------------------
interface CategoryDef {
  label: string;
  features: string[]; // ordered list of feature keys to show
}

/** Features that show their displayName as the value (varies per plan) instead of check/dash */
const VALUE_FEATURES = new Set(['fleet_limit', 'user_limit', 'support_level', 'sla', 'onboarding']);

/** Map add-on slugs to the same Lucide icons used in the app sidebar */
const ADDON_ICON_MAP: Record<string, LucideIcon> = {
  edi_integration: Zap,
  shield_compliance: ShieldCheck,
  route_planning: Route,
  doc_intelligence: FileText,
  command_center: Home,
  ifta_reporting: Fuel,
  continuous_monitoring: Activity,
  insights: BarChart3,
};

/** Static labels for value features (the row label in the comparison table) */
const VALUE_FEATURE_LABELS: Record<string, string> = {
  fleet_limit: 'Fleet Size',
  user_limit: 'Team Members',
  support_level: 'Support',
  sla: 'SLA',
  onboarding: 'Onboarding',
};

/** Fleet limit text from plan config */
function getFleetLimitText(plan: PlanConfig): string {
  return plan.fleetLimit ? `Up to ${plan.fleetLimit} trucks` : 'Unlimited trucks';
}

function getUserLimitText(plan: PlanConfig): string {
  return plan.userLimit ? `Up to ${plan.userLimit} users` : 'Unlimited users';
}

/** Map add-on backend categories to comparison table category labels */
const ADDON_CATEGORY_LABEL_MAP: Record<string, string> = {
  operations: 'Operations',
  integrations: 'Integrations',
  ai: 'Sally AI',
  compliance: 'Operations',
};

const CATEGORIES: CategoryDef[] = [
  {
    label: 'Core TMS',
    features: ['fleet_management', 'loads_tracking', 'close_out', 'billing', 'driver_pay', 'driver_app'],
  },
  {
    label: 'Sally AI',
    features: ['sally_ai_chat', 'sally_ai_actions', 'voice_mode'],
  },
  {
    label: 'Operations',
    features: ['alerts'],
  },
  {
    label: 'Integrations',
    features: ['samsara_integration', 'load_board', 'quickbooks_integration', 'tms_integration', 'custom_integrations'],
  },
  {
    label: 'Developer Platform',
    features: ['api_keys', 'webhooks', 'oauth_clients'],
  },
  {
    label: 'Support & Limits',
    features: ['fleet_limit', 'user_limit', 'support_level', 'sla', 'onboarding'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getEntitlementMap(entitlements: PlanEntitlement[]): Map<string, PlanEntitlement> {
  const map = new Map<string, PlanEntitlement>();
  for (const e of entitlements) map.set(e.feature, e);
  return map;
}

function formatPrice(cents: number | null): { amount: string; decimal?: string } {
  if (cents === null) return { amount: 'Custom' };
  const dollars = Math.floor(cents / 100);
  return { amount: `$${dollars}` };
}

// ---------------------------------------------------------------------------
// Fallback static plans
// ---------------------------------------------------------------------------
const STATIC_PLANS: PlanConfig[] = [
  {
    id: 1,
    plan: 'STARTER',
    displayName: 'Haul',
    tagline: 'For owner-operators getting started',
    pricePerUnit: 2900,
    unitLabel: 'truck/month',
    fleetLimit: 10,
    userLimit: 5,
    isPopular: false,
    ctaLabel: 'Start Free Trial',
    ctaUrl: '/register',
    displayOrder: 1,
    entitlements: [],
  },
  {
    id: 2,
    plan: 'PROFESSIONAL',
    displayName: 'Fleet',
    tagline: 'For growing fleet operations',
    pricePerUnit: 4900,
    unitLabel: 'truck/month',
    fleetLimit: 25,
    userLimit: 25,
    isPopular: true,
    ctaLabel: 'Start Free Trial',
    ctaUrl: '/register',
    displayOrder: 2,
    entitlements: [],
  },
  {
    id: 3,
    plan: 'ENTERPRISE',
    displayName: 'Freight Force',
    tagline: 'For established carriers',
    pricePerUnit: null,
    unitLabel: 'truck/month',
    fleetLimit: null,
    userLimit: null,
    isPopular: false,
    ctaLabel: 'Contact Sales',
    ctaUrl: mailto('sally'),
    displayOrder: 3,
    entitlements: [],
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function PricingPage() {
  const [apiPlans, addOns] = await Promise.all([getPlans(), getAddOns()]);
  const plans = apiPlans.length > 0 ? apiPlans : STATIC_PLANS;

  const publicPlans = plans
    .filter((p) => ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'].includes(p.plan))
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const planMaps = publicPlans.map((p) => ({
    plan: p,
    entitlements: getEntitlementMap(p.entitlements),
  }));

  const activeAddOns = addOns.filter((a) => a.isActive).sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="bg-background min-h-[calc(100vh-57px)] py-16 px-4 md:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-16">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-foreground tracking-tight">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            One price per truck. No hidden fees. Start with a 30-day free trial.
          </p>
        </div>

        {/* ── Plan Cards ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 mb-20">
          {publicPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* ── Feature Comparison Table ────────────────────────────── */}
        <div className="mb-16">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground">Compare plans</h2>
            <p className="mt-2 text-muted-foreground">See exactly what&apos;s included in each tier</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              {/* Table header — plan names */}
              <thead>
                <tr>
                  <th className="text-left py-4 pr-4 text-sm font-medium text-muted-foreground w-[40%]">Feature</th>
                  {publicPlans.map((p) => (
                    <th key={p.id} className="text-center py-4 px-2 min-w-[120px]">
                      <span className="text-sm font-semibold text-foreground">{p.displayName}</span>
                      {p.isPopular && (
                        <Badge className="ml-2 bg-black dark:bg-white text-white dark:text-black text-2xs px-1.5 py-0">
                          Popular
                        </Badge>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {CATEGORIES.map((cat) => {
                  // Find add-ons that belong to this category
                  const categoryAddOns = activeAddOns.filter((a) => {
                    const mappedLabel = ADDON_CATEGORY_LABEL_MAP[a.category] ?? a.category;
                    return mappedLabel === cat.label;
                  });
                  return (
                    <CategorySection
                      key={cat.label}
                      category={cat}
                      planMaps={planMaps}
                      addOns={categoryAddOns}
                      publicPlans={publicPlans}
                    />
                  );
                })}
                {/* Add-ons whose category doesn't match any existing section */}
                {(() => {
                  const mappedLabels = new Set(CATEGORIES.map((c) => c.label));
                  const unmapped = activeAddOns.filter((a) => {
                    const mappedLabel = ADDON_CATEGORY_LABEL_MAP[a.category] ?? a.category;
                    return !mappedLabels.has(mappedLabel);
                  });
                  if (unmapped.length === 0) return null;
                  return (
                    <CategorySection
                      category={{ label: 'Add-ons', features: [] }}
                      planMaps={planMaps}
                      addOns={unmapped}
                      publicPlans={publicPlans}
                    />
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Power Up With Add-ons ─────────────────────────────── */}
        {addOns.length > 0 && (
          <section className="mb-16">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground">Power Up With Add-ons</h2>
              <p className="text-muted-foreground mt-2">Available on any plan. Purchase only what you need.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-fr">
              {addOns
                .filter((a) => a.isActive)
                .sort((a, b) => a.displayOrder - b.displayOrder)
                .map((addOn) => (
                  <AddOnCard key={addOn.slug} addOn={addOn} />
                ))}
            </div>
          </section>
        )}

        {/* ── Bottom CTA ─────────────────────────────────────────── */}
        <div className="text-center py-12 border-t border-border">
          <h3 className="text-xl font-bold text-foreground mb-2">Ready to get started?</h3>
          <p className="text-sm text-muted-foreground mb-6">
            All plans include a <span className="text-foreground font-medium">30-day free trial</span>. No credit card
            required.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link href="/register">
              <Button>
                Start Free Trial
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
            <a href={mailto('sally')}>
              <Button variant="outline">Contact Sales</Button>
            </a>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Already have access?{' '}
            <Link
              href="/login"
              className="text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
            >
              Login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan Card (top section)
// ---------------------------------------------------------------------------
function PlanCard({ plan }: { plan: PlanConfig }) {
  const isEnterprise = plan.plan === 'ENTERPRISE';
  const isMailto = plan.ctaUrl?.startsWith('mailto:');
  const price = formatPrice(plan.pricePerUnit);

  // Pick 5-6 highlight features for the card (enabled only, software type)
  const highlights = plan.entitlements.filter((e) => e.enabled).slice(0, 6);

  const PlanIcon = isEnterprise ? Building2 : plan.isPopular ? Sparkles : Truck;

  return (
    <div
      className={`relative rounded-xl border ${
        plan.isPopular ? 'border-2 border-foreground' : 'border-border'
      } bg-card p-6 flex flex-col`}
    >
      {plan.isPopular && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
          <Badge className="bg-black dark:bg-white text-white dark:text-black text-xs px-3 py-0.5">Most Popular</Badge>
        </div>
      )}

      {/* Plan name + icon */}
      <div className="flex items-center gap-2 mb-1">
        <PlanIcon className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-xl font-bold text-foreground">{plan.displayName}</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-5">{plan.tagline}</p>

      {/* Price */}
      <div className="mb-6">
        <div className="flex items-end gap-1">
          <span className="text-4xl font-bold text-foreground">{price.amount}</span>
          {plan.pricePerUnit !== null && <span className="text-sm text-muted-foreground mb-1">/{plan.unitLabel}</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{getFleetLimitText(plan)}</p>
      </div>

      {/* CTA */}
      <div className="mb-6">
        {isMailto ? (
          <a href={plan.ctaUrl ?? mailto('sally')} className="block">
            <Button className="w-full" variant={plan.isPopular ? 'default' : 'outline'}>
              {plan.ctaLabel}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </a>
        ) : (
          <Link href={plan.ctaUrl ?? '/register'} className="block">
            <Button className="w-full" variant={plan.isPopular ? 'default' : 'outline'}>
              {plan.ctaLabel}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        )}
      </div>

      {/* Highlight features */}
      {highlights.length > 0 && (
        <ul className="space-y-2 flex-1">
          {highlights.map((e) => (
            <li key={e.feature} className="flex items-center gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 shrink-0 text-muted-foreground" />
              {e.displayName}
            </li>
          ))}
          {plan.entitlements.filter((e) => e.enabled).length > highlights.length && (
            <li className="text-xs text-muted-foreground pl-6">
              + {plan.entitlements.filter((e) => e.enabled).length - highlights.length} more features
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category Section (comparison table)
// ---------------------------------------------------------------------------
function CategorySection({
  category,
  planMaps,
  addOns = [],
  publicPlans = [],
}: {
  category: CategoryDef;
  planMaps: { plan: PlanConfig; entitlements: Map<string, PlanEntitlement> }[];
  addOns?: AddOn[];
  publicPlans?: PlanConfig[];
}) {
  const planKeyMap: Record<string, string> = {
    STARTER: 'STARTER',
    PROFESSIONAL: 'PROFESSIONAL',
    ENTERPRISE: 'ENTERPRISE',
  };

  // Skip empty categories (no features AND no add-ons)
  const nonAddOnFeatures = category.features.filter((f) => !isAddOnFeature(f));
  if (nonAddOnFeatures.length === 0 && addOns.length === 0) return null;

  return (
    <>
      {/* Category header row */}
      <tr>
        <td
          colSpan={planMaps.length + 1}
          className="pt-6 pb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border"
        >
          {category.label}
        </td>
      </tr>

      {/* Feature rows — add-on features from entitlements are excluded (shown as add-on rows below) */}
      {nonAddOnFeatures.map((featureKey) => {
        const isValueFeature = VALUE_FEATURES.has(featureKey);
        // For value features use static label, otherwise get from entitlement displayName
        const rowLabel = isValueFeature
          ? (VALUE_FEATURE_LABELS[featureKey] ?? featureKey)
          : (planMaps.find((pm) => pm.entitlements.has(featureKey))?.entitlements.get(featureKey)?.displayName ??
            featureKey);

        return (
          <tr key={featureKey} className="border-b border-border/50 last:border-b-0">
            <td className="py-3 pr-4 text-sm text-foreground">{rowLabel}</td>
            {planMaps.map(({ plan, entitlements }) => {
              const e = entitlements.get(featureKey);
              const enabled = e?.enabled ?? false;

              // Value features show text instead of check/dash
              if (isValueFeature) {
                // Fleet/user limits — read from plan config
                if (featureKey === 'fleet_limit') {
                  return (
                    <td key={plan.id} className="py-3 px-2 text-center text-sm text-foreground font-medium">
                      {getFleetLimitText(plan)}
                    </td>
                  );
                }
                if (featureKey === 'user_limit') {
                  return (
                    <td key={plan.id} className="py-3 px-2 text-center text-sm text-foreground font-medium">
                      {getUserLimitText(plan)}
                    </td>
                  );
                }
                // Display features (support_level, sla, onboarding) show their per-plan displayName
                if (e) {
                  return (
                    <td key={plan.id} className="py-3 px-2 text-center text-sm text-muted-foreground">
                      {e.displayName}
                    </td>
                  );
                }
                return (
                  <td key={plan.id} className="py-3 px-2 text-center">
                    <Minus className="h-4 w-4 mx-auto text-gray-300 dark:text-gray-600" />
                  </td>
                );
              }

              return (
                <td key={plan.id} className="py-3 px-2 text-center">
                  {enabled ? (
                    <Check className="h-4 w-4 mx-auto text-muted-foreground" />
                  ) : (
                    <Minus className="h-4 w-4 mx-auto text-gray-300 dark:text-gray-600" />
                  )}
                </td>
              );
            })}
          </tr>
        );
      })}

      {/* Add-on rows — show limits or "Unlimited" with Add-on badge */}
      {addOns.map((addOn) => {
        const _Icon = ADDON_ICON_MAP[addOn.slug] ?? Zap;
        const hasLimits = !!addOn.usageLimitUnit && addOn.usageLimits;
        const limits = (addOn.usageLimits ?? {}) as Record<string, number>;

        return (
          <tr key={addOn.slug} className="border-b border-border/50 last:border-b-0">
            <td className="py-3 pr-4">
              <div className="flex items-center gap-2">
                <span className="text-sm text-foreground">{addOn.name}</span>
                <Badge
                  variant="outline"
                  className="text-2xs px-1.5 py-0 shrink-0 font-normal text-muted-foreground border-border"
                >
                  Add-on
                </Badge>
              </div>
            </td>
            {publicPlans.map((plan) => {
              if (hasLimits) {
                const limit = limits[planKeyMap[plan.plan]] ?? 0;
                return (
                  <td key={plan.id} className="py-3 px-2 text-center">
                    <span className="text-sm tabular-nums text-foreground">{limit.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground ml-0.5">/{addOn.usageLimitUnit}</span>
                  </td>
                );
              }
              return (
                <td key={plan.id} className="py-3 px-2 text-center text-sm text-muted-foreground">
                  Unlimited
                </td>
              );
            })}
          </tr>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Add-on Card (Power Up section)
// ---------------------------------------------------------------------------
function AddOnCard({ addOn }: { addOn: AddOn }) {
  const Icon = ADDON_ICON_MAP[addOn.slug] ?? Zap;
  const hasLimits = !!addOn.usageLimitUnit && !!addOn.usageLimits;

  return (
    <div className="group bg-card border border-border rounded-xl p-5 flex flex-col hover:border-foreground/20 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5 dark:hover:shadow-black/25 transition-all duration-300 ease-out">
      {/* Icon */}
      <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-muted group-hover:bg-foreground group-hover:text-background transition-colors duration-300 mb-3">
        <Icon className="h-4 w-4" />
      </div>

      {/* Name + price */}
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold text-foreground text-sm">{addOn.name}</h3>
        <div className="shrink-0 text-right">
          <span className="font-bold text-foreground">{formatPriceCents(addOn.priceCents)}</span>
        </div>
      </div>

      {/* Description */}
      {addOn.description && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed flex-1">{addOn.description}</p>
      )}

      {/* Usage hint */}
      <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border/40">
        {hasLimits ? 'Usage-based pricing' : 'Unlimited usage'}
      </p>
    </div>
  );
}
