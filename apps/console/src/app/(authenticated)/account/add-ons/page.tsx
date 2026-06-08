'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Switch } from '@sally/ui/components/ui/switch';
import { usePlan } from '@/features/plans/use-plan';
import { useAddOnCatalog, useMyAddOns, ADD_ONS_QUERY_KEYS } from '@/features/add-ons/hooks';
import { type AddOn, type TenantAddOn } from '@/features/add-ons/api';
import { apiClient } from '@/lib/api-client';
import { formatPriceCents } from '@sally/shared-types';
import type { AddOnRequest } from '@sally/shared-types';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatOverageRate(overageRateCents: number | null, unit: string | null): string {
  if (overageRateCents === null) return '';
  const dollars = (overageRateCents / 100).toFixed(2);
  return `$${dollars}/${unit ?? 'unit'}`;
}

function getUsagePercentage(current: number, limit: number | null): number {
  if (limit === null || limit === 0) return 0;
  return Math.min(100, Math.round((current / limit) * 100));
}

// ---------------------------------------------------------------------------
// Card States
// ---------------------------------------------------------------------------
interface AddOnCardProps {
  addOn: AddOn;
  subscription: TenantAddOn | undefined;
  pendingRequest: AddOnRequest | undefined;
  onRequest: (slug: string) => void;
  isRequesting: boolean;
  onToggleOverage: (slug: string, enabled: boolean) => void;
}

function AddOnCard({ addOn, subscription, pendingRequest, onRequest, isRequesting, onToggleOverage }: AddOnCardProps) {
  const isActive = subscription && subscription.status === 'ACTIVE';
  const isGifted = isActive && subscription.source === 'gifted';
  const isPending = !!pendingRequest;

  // Border color by state
  const borderClass = isActive ? 'border-violet-500/50' : isPending ? 'border-amber-500/50' : 'border-border';

  return (
    <div className={`relative rounded-xl border ${borderClass} bg-card p-5 flex flex-col gap-3`}>
      {/* Top-right badge */}
      <div className="absolute top-3 right-3">
        {isActive && subscription ? (
          <Badge className="bg-violet-500/10 text-violet-400 border-violet-500/50 text-[11px]">
            {isGifted ? 'Gifted' : formatPriceCents(subscription.priceCents)}
          </Badge>
        ) : isPending ? (
          <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/50 text-[11px]">Pending</Badge>
        ) : (
          <span className="text-xs text-muted-foreground font-medium">{formatPriceCents(addOn.priceCents)}</span>
        )}
      </div>

      {/* Icon */}
      <div className={`text-[28px] leading-none ${!isActive && !isPending ? 'opacity-50' : ''}`}>
        {addOn.icon ?? '📦'}
      </div>

      {/* Name & description */}
      <div>
        <h3 className="text-sm font-bold text-foreground">{addOn.name}</h3>
        {addOn.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{addOn.description}</p>}
      </div>

      {/* Status + usage + actions */}
      <div className="mt-auto pt-2 space-y-3">
        {/* Status label */}
        {isActive ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-400" />
            <span className="text-violet-400 font-medium">Active{isGifted ? ' (gifted)' : ''}</span>
          </div>
        ) : isPending ? (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="text-amber-400 font-medium">Request pending</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-gray-400 dark:bg-gray-600" />
            <span className="text-muted-foreground">Available</span>
          </div>
        )}

        {/* Usage bar (for active metered subscriptions) */}
        {isActive && subscription.usageLimit !== null && subscription.usageLimitUnit && (
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>
                {subscription.currentUsage} / {subscription.usageLimit} {subscription.usageLimitUnit}
              </span>
              <span>{getUsagePercentage(subscription.currentUsage, subscription.usageLimit)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${getUsagePercentage(subscription.currentUsage, subscription.usageLimit)}%` }}
              />
            </div>

            {/* Overage toggle */}
            {addOn.overageRateCents !== null && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Allow overage ({formatOverageRate(addOn.overageRateCents, addOn.usageLimitUnit)})
                </span>
                <Switch
                  checked={subscription.allowOverage}
                  onCheckedChange={(checked) => onToggleOverage(addOn.slug, checked)}
                />
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {!isActive && !isPending && (
          <Button
            size="sm"
            className="w-full bg-violet-600 hover:bg-violet-700 text-white"
            onClick={() => onRequest(addOn.slug)}
            loading={isRequesting}
          >
            Request from SALLY
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function AddOnsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-52 rounded-xl" />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AddOnsPage() {
  const { plan, displayName, isLoading: planLoading } = usePlan();
  const { data: catalog, isLoading: catalogLoading } = useAddOnCatalog();
  const { data: myAddOns, isLoading: myAddOnsLoading } = useMyAddOns();
  const queryClient = useQueryClient();
  const [requestingSlug, setRequestingSlug] = useState<string | null>(null);

  // Fetch pending requests
  const { data: myRequests } = useQuery({
    queryKey: ['add-ons', 'my-requests'],
    queryFn: () => apiClient<AddOnRequest[]>('/add-ons/my-requests'),
  });

  const isLoading = planLoading || catalogLoading || myAddOnsLoading;

  // Request mutation
  const { mutate: requestAddOn } = useMutation({
    mutationFn: (slug: string) =>
      apiClient(`/add-ons/${slug}/request`, {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    onMutate: (slug) => setRequestingSlug(slug),
    onSuccess: () => {
      toast.success('Request sent! The SALLY team will review and activate it for you.');
      queryClient.invalidateQueries({ queryKey: ['add-ons', 'my-requests'] });
    },
    onError: (error: Error) => {
      toast.error('Could not send request', { description: error.message });
    },
    onSettled: () => setRequestingSlug(null),
  });

  // Overage toggle mutation
  const { mutate: toggleOverage } = useMutation({
    mutationFn: ({ slug, enabled }: { slug: string; enabled: boolean }) =>
      apiClient(`/add-ons/${slug}/overage`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: () => {
      toast.success('Overage setting updated');
      queryClient.invalidateQueries({ queryKey: ADD_ONS_QUERY_KEYS.myAddOns });
    },
    onError: (error: Error) => {
      toast.error('Could not update overage', { description: error.message });
    },
  });

  // Map add-on ID → tenant subscription for quick lookup
  const subscriptionMap = useMemo(() => {
    const map = new Map<string, TenantAddOn>();
    if (myAddOns) {
      for (const sub of myAddOns) {
        map.set(sub.addOnId, sub);
      }
    }
    return map;
  }, [myAddOns]);

  // Map add-on ID → pending request
  const requestMap = useMemo(() => {
    const map = new Map<string, AddOnRequest>();
    if (myRequests) {
      for (const req of myRequests) {
        if (req.status === 'PENDING') {
          map.set(req.addOnId, req);
        }
      }
    }
    return map;
  }, [myRequests]);

  // Sort catalog: active first, pending second, then by displayOrder
  const sortedCatalog = useMemo(() => {
    if (!catalog) return [];
    return [...catalog].sort((a, b) => {
      const aActive = subscriptionMap.has(a.id) ? 0 : requestMap.has(a.id) ? 1 : 2;
      const bActive = subscriptionMap.has(b.id) ? 0 : requestMap.has(b.id) ? 1 : 2;
      if (aActive !== bActive) return aActive - bActive;
      return a.displayOrder - b.displayOrder;
    });
  }, [catalog, subscriptionMap, requestMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">Add-ons</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Enhance your SALLY experience with additional capabilities. Purchase only what you need.
          </p>
        </div>
        {!planLoading && plan && (
          <Badge variant="outline" className="self-start sm:self-auto">
            {displayName ?? plan} plan
          </Badge>
        )}
      </div>

      {/* Card grid */}
      {isLoading ? (
        <AddOnsSkeleton />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedCatalog.map((addOn) => (
            <AddOnCard
              key={addOn.id}
              addOn={addOn}
              subscription={subscriptionMap.get(addOn.id)}
              pendingRequest={requestMap.get(addOn.id)}
              onRequest={(slug) => requestAddOn(slug)}
              isRequesting={requestingSlug === addOn.slug}
              onToggleOverage={(slug, enabled) => toggleOverage({ slug, enabled })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
