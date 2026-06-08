'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Switch } from '@sally/ui/components/ui/switch';
import { getUsageColor } from '@/features/billing/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@sally/ui/components/ui/alert-dialog';
import {
  Home,
  Route,
  ShieldCheck,
  Radio,
  FileText,
  BarChart3,
  ArrowLeftRight,
  Fuel,
  Check,
  Lock,
  ArrowUpRight,
  type LucideIcon,
} from 'lucide-react';
import { useAddOnCatalog, useMyAddOns, ADD_ONS_QUERY_KEYS } from '@/features/add-ons/hooks';
import { addOnsApi } from '@/features/add-ons/api';
import { ActivateAddOnButton } from '@/features/add-ons/components/activate-add-on-button';
import type { TenantAddOn } from '@sally/shared-types';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { useUpgradeUrl } from '@/features/platform/plans/hooks/use-upgrade-url';
import { upgradeRegistry } from '@/features/platform/plans/config/upgrade-registry';
import { isAddOnFeature } from '@sally/shared-types';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags/hooks/use-feature-flags';
import { formatCents } from '@/shared/lib/utils/formatters';
import { showSuccess, showError } from '@/shared/lib/toast';
import { cn } from '@sally/ui';
import { mailto } from '@/shared/lib/contacts';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------------------------------------------------------------------------
// Icon map
// ---------------------------------------------------------------------------
const ADDON_ICON_MAP: Record<string, LucideIcon> = {
  command_center: Home,
  route_planning: Route,
  shield_compliance: ShieldCheck,
  continuous_monitoring: Radio,
  doc_intelligence: FileText,
  insights: BarChart3,
  edi_integration: ArrowLeftRight,
  ifta_reporting: Fuel,
};

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

function formatUsageLimit(
  limits: Record<string, number> | null | undefined,
  unit: string | null | undefined,
  plan: string | undefined,
): string | null {
  if (!limits || !unit || !plan) return null;
  const limit = limits[plan.toUpperCase()];
  if (!limit) return null;
  return `${limit.toLocaleString()} ${unit}/mo`;
}

function getUsagePercentage(current: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

// ---------------------------------------------------------------------------
// Cancel button with confirmation
// ---------------------------------------------------------------------------
function CancelButton({ slug, name }: { slug: string; name: string }) {
  const queryClient = useQueryClient();
  const { mutate: cancel, isPending } = useMutation({
    mutationFn: () => addOnsApi.cancelAddOn(slug),
    onSuccess: () => {
      showSuccess(`${name} has been cancelled.`);
      queryClient.invalidateQueries({ queryKey: ADD_ONS_QUERY_KEYS.myAddOns });
    },
    onError: (error: Error) => showError('Failed to cancel', extractErrorMessage(error)),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive">
          Cancel
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will immediately deactivate {name} for your organization. You can re-activate it anytime from this
            page.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep Active</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => cancel()}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Yes, Cancel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---------------------------------------------------------------------------
// Add-on row card
// ---------------------------------------------------------------------------
function AddOnRow({
  slug,
  name,
  description,
  priceCents,
  providerPriceId,
  usageLimits,
  usageLimitUnit,
  overageRateCents,
  isActive,
  isCancelled,
  subscription,
  plan,
  onToggleOverage,
}: {
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  providerPriceId: string | null;
  usageLimits: Record<string, number> | null;
  usageLimitUnit: string | null;
  overageRateCents: number | null;
  isActive: boolean;
  isCancelled: boolean;
  subscription: TenantAddOn | undefined;
  plan: string | undefined;
  onToggleOverage: (slug: string, enabled: boolean) => void;
}) {
  const Icon = ADDON_ICON_MAP[slug] ?? BarChart3;
  const [requested] = useState(false);
  const _queryClient = useQueryClient();
  const usageLabel = formatUsageLimit(usageLimits, usageLimitUnit, plan);

  const registryEntry =
    upgradeRegistry[slug === 'shield_compliance' ? 'shield' : slug === 'ifta_reporting' ? 'ifta' : slug];
  const benefits = registryEntry?.benefits ?? [];

  const isGifted = isActive && subscription?.source === 'gifted';

  // Check if there's a pending request for this add-on (set by ActivateAddOnButton via cache invalidation)

  return (
    <Card
      className={cn(
        'group transition-all duration-200',
        isActive
          ? 'border-foreground/20'
          : isCancelled
            ? 'border-dashed border-muted-foreground/30 hover:border-foreground/20 hover:shadow-sm'
            : 'hover:border-foreground/20 hover:shadow-sm',
      )}
    >
      <CardContent className="p-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          {/* Left: Icon + info */}
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-xl shrink-0 transition-colors',
                isActive
                  ? 'bg-foreground/10 text-foreground'
                  : 'bg-muted text-muted-foreground group-hover:bg-foreground/10 group-hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-foreground">{name}</h3>
                {isActive && (
                  <Badge variant="outline" className="text-2xs">
                    <Check className="h-3 w-3 mr-1" />
                    {isGifted ? 'Gifted' : 'Active'}
                  </Badge>
                )}
                {!isActive && isCancelled && (
                  <Badge variant="outline" className="text-2xs text-muted-foreground">
                    Previously active
                  </Badge>
                )}
              </div>

              <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{description}</p>

              {/* Benefits row */}
              {benefits.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5">
                  {benefits.map((b, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Check className="h-3 w-3 text-muted-foreground shrink-0" />
                      {b}
                    </span>
                  ))}
                </div>
              )}

              {/* Usage meter for active metered add-ons */}
              {isActive && subscription && subscription.usageLimit !== null && subscription.usageLimitUnit && (
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {subscription.currentUsage} / {subscription.usageLimit} {subscription.usageLimitUnit}
                    </span>
                    <span>{getUsagePercentage(subscription.currentUsage, subscription.usageLimit)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        getUsageColor(subscription.currentUsage, subscription.usageLimit!),
                      )}
                      style={{
                        width: `${getUsagePercentage(subscription.currentUsage, subscription.usageLimit)}%`,
                      }}
                    />
                  </div>

                  {/* Overage toggle */}
                  {overageRateCents !== null && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-xs text-muted-foreground">
                        Allow overage ({formatCents(overageRateCents)}/{usageLimitUnit ?? 'unit'})
                      </span>
                      <Switch
                        checked={subscription.allowOverage}
                        onCheckedChange={(checked) => onToggleOverage(slug, checked)}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Price + CTA */}
          <div className="flex items-center gap-4 lg:flex-col lg:items-end lg:gap-2.5 shrink-0 lg:w-[180px]">
            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span className="text-xl font-bold text-foreground tracking-tight">
                  {isGifted ? 'Free' : formatPrice(priceCents)}
                </span>
                {!isGifted && <span className="text-xs text-muted-foreground">/mo</span>}
              </div>
              {/* Usage line */}
              <p className={cn('text-[11px] mt-0.5 h-4', usageLabel ? 'text-muted-foreground' : 'invisible')}>
                {usageLabel
                  ? `${usageLabel}${overageRateCents ? ` then ${formatPrice(overageRateCents)} each` : ''}`
                  : '\u00A0'}
              </p>
            </div>

            {isActive ? (
              <div className="flex gap-2 w-full">
                <Button variant="outline" size="sm" className="flex-1" disabled>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Active
                </Button>
                <CancelButton slug={slug} name={name} />
              </div>
            ) : requested ? (
              <Button variant="outline" size="sm" className="w-full" disabled>
                Requested
              </Button>
            ) : (
              <ActivateAddOnButton
                slug={slug}
                name={name}
                hasProviderPrice={!!providerPriceId}
                size="sm"
                className="w-full"
                label={isCancelled ? 'Reactivate' : undefined}
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AccountAddOnsPage() {
  const { data: catalog, isLoading: catalogLoading } = useAddOnCatalog();
  const { data: myAddOns, isLoading: addOnsLoading } = useMyAddOns();
  const { displayName, plan, planDetails, isLoading: planLoading, isOnTrial: _isOnTrial } = usePlan();
  const { upgradeUrl, isPaymentMode } = useUpgradeUrl();
  const { data: paymentEnabled } = useFeatureFlagEnabled('payment_system');
  const isBillingEnabled = paymentEnabled === true;
  const queryClient = useQueryClient();

  const isLoading = catalogLoading || addOnsLoading || planLoading;

  // Overage toggle mutation
  const { mutate: toggleOverage } = useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) => addOnsApi.toggleOverage(slug, enabled),
    onSuccess: () => {
      showSuccess('Overage setting updated');
      queryClient.invalidateQueries({ queryKey: ADD_ONS_QUERY_KEYS.myAddOns });
    },
    onError: (error: Error) => {
      showError('Could not update overage', extractErrorMessage(error));
    },
  });

  const activeAddOnSlugs = useMemo(
    () => new Set(myAddOns?.filter((s) => s.status === 'ACTIVE').map((s) => s.addOn.slug) ?? []),
    [myAddOns],
  );

  // Build subscription map by slug
  const subscriptionMap = useMemo(() => {
    const map = new Map<string, TenantAddOn>();
    if (myAddOns) {
      for (const sub of myAddOns) {
        if (sub.status === 'ACTIVE') {
          map.set(sub.addOn.slug, sub);
        }
      }
    }
    return map;
  }, [myAddOns]);

  // Track cancelled add-ons (previously active, now cancelled)
  const cancelledSlugs = useMemo(() => {
    const slugs = new Set<string>();
    if (myAddOns) {
      for (const sub of myAddOns) {
        if (sub.status === 'CANCELLED') {
          slugs.add(sub.addOn.slug);
        }
      }
    }
    // Don't mark as cancelled if it's currently active (re-activated)
    for (const slug of activeAddOnSlugs) {
      slugs.delete(slug);
    }
    return slugs;
  }, [myAddOns, activeAddOnSlugs]);

  // Entitlements from backend
  const { includedFeatures, lockedFeatures } = useMemo(() => {
    const entitlements = planDetails?.planConfig?.entitlements ?? [];
    const upgradable = entitlements.filter(
      (e: { feature: string; enabled: boolean }) => !isAddOnFeature(e.feature) && !!upgradeRegistry[e.feature],
    );
    return {
      includedFeatures: upgradable.filter((e: { enabled: boolean }) => e.enabled),
      lockedFeatures: upgradable.filter((e: { enabled: boolean }) => !e.enabled),
    };
  }, [planDetails]);

  const activeCount = activeAddOnSlugs.size;
  const nextPlanName = plan === 'STARTER' ? 'Fleet' : plan === 'PROFESSIONAL' ? 'Freight Force' : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Add-ons</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Unlock more with SALLY.
          {displayName && (
            <>
              {' '}
              You&apos;re on the <span className="font-medium text-foreground">{displayName}</span> plan
              {activeCount > 0 && (
                <>
                  {' '}
                  with{' '}
                  <span className="text-foreground font-medium">
                    {activeCount} add-on{activeCount > 1 ? 's' : ''}
                  </span>{' '}
                  active
                </>
              )}
              .
            </>
          )}
        </p>
      </div>

      {/* Add-ons section */}
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4">Add-ons</h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <Skeleton className="h-11 w-11 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                    <div className="space-y-2 shrink-0">
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-8 w-24 rounded-md" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {[...(catalog ?? [])]
              .sort((a, b) => {
                const rank = (slug: string) => (activeAddOnSlugs.has(slug) ? 0 : cancelledSlugs.has(slug) ? 1 : 2);
                const aRank = rank(a.slug);
                const bRank = rank(b.slug);
                if (aRank !== bRank) return aRank - bRank;
                return a.displayOrder - b.displayOrder;
              })
              .map((addOn) => (
                <AddOnRow
                  key={addOn.slug}
                  slug={addOn.slug}
                  name={addOn.name}
                  description={addOn.description ?? ''}
                  priceCents={addOn.priceCents ?? 0}
                  providerPriceId={addOn.providerPriceId ?? null}
                  usageLimits={addOn.usageLimits as Record<string, number> | null}
                  usageLimitUnit={addOn.usageLimitUnit ?? null}
                  overageRateCents={addOn.overageRateCents ?? null}
                  isActive={activeAddOnSlugs.has(addOn.slug)}
                  isCancelled={cancelledSlugs.has(addOn.slug)}
                  subscription={subscriptionMap.get(addOn.slug)}
                  plan={plan}
                  onToggleOverage={(slug, enabled) => toggleOverage({ slug, enabled })}
                />
              ))}
          </div>
        )}
      </section>

      {/* Plan Features section */}
      {!isLoading && (includedFeatures.length > 0 || lockedFeatures.length > 0) && (
        <section className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">{displayName ?? 'Your'} Plan</h2>
            {nextPlanName && (
              <a
                href={isPaymentMode ? upgradeUrl : mailto('sally', `Upgrade to ${nextPlanName}`)}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Upgrade to {nextPlanName}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
            )}
          </div>

          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {/* Included */}
              {includedFeatures.map((e: { feature: string; displayName: string }) => {
                const reg = upgradeRegistry[e.feature]!;
                const FeatureIcon = reg.icon;
                return (
                  <div key={e.feature} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/10 text-foreground shrink-0">
                      <FeatureIcon className="h-4 w-4" />
                    </div>
                    <span className="text-sm font-medium text-foreground flex-1">{e.displayName}</span>
                    <Check className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                );
              })}

              {/* Locked */}
              {lockedFeatures.map((e: { feature: string; displayName: string }) => {
                const reg = upgradeRegistry[e.feature]!;
                const FeatureIcon = reg.icon;
                return (
                  <div key={e.feature} className="flex items-center gap-3 px-5 py-3 opacity-60">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                      <FeatureIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-muted-foreground">{e.displayName}</span>
                    </div>
                    <Badge variant="outline" className="text-2xs shrink-0">
                      <Lock className="h-2.5 w-2.5 mr-1" />
                      {reg.requiredPlan ?? 'Upgrade'}
                    </Badge>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center mt-4 pb-4">
        {isBillingEnabled
          ? 'Add-ons activate instantly. Plan upgrades take effect immediately.'
          : 'Add-on requests are reviewed within 24 hours. Plan upgrades take effect immediately.'}{' '}
        <a href={mailto('support')} className="underline hover:text-foreground transition-colors">
          support@appshore.in
        </a>
      </p>
    </div>
  );
}
