'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/ui/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/ui/components/ui/dialog';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Textarea } from '@app/ui/components/ui/textarea';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@app/ui/components/ui/collapsible';
import { Check, ChevronDown, Clock, ExternalLink, Puzzle, X } from 'lucide-react';
import { showSuccess, showError } from '@app/ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags/hooks/use-feature-flags';
import { adminAddOnsApi } from '../api';
import type { TenantAddOn } from '../api';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { QUERY_TIERS } from '@appshore/web-core/shared/config/query-tiers';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

interface AddOn {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceCents: number | null;
  billingInterval: string;
  featureKey: string;
  isActive: boolean;
}

interface AddOnRequest {
  id: string;
  tenantId: number;
  addOnId: string;
  status: 'pending' | 'approved' | 'declined';
  requestedAt: string;
  requestNote: string | null;
  giftedPriceCents: number | null;
  addOn: {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    priceCents: number | null;
    category: string;
  };
  tenant?: {
    id: number;
    companyName: string;
    tenantId: string;
  };
}

function formatPrice(cents: number | null): string {
  if (cents === null || cents === undefined) return 'Custom';
  if (cents === 0) return 'Free';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

type PricingMode = 'full' | 'free' | 'custom';

interface TenantAddOnsTabProps {
  tenantId: string;
  tenantNumericId: number | undefined;
}

export function TenantAddOnsTab({ tenantId: _tenantId, tenantNumericId }: TenantAddOnsTabProps) {
  const queryClient = useQueryClient();
  const { formatDateTime } = useFormatters();
  const [selectedSlug, setSelectedSlug] = useState('');
  const [enableDialogOpen, setEnableDialogOpen] = useState(false);
  const [pricingMode, setPricingMode] = useState<PricingMode>('full');
  const [customPrice, setCustomPrice] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<TenantAddOn | null>(null);
  const [approveTarget, setApproveTarget] = useState<AddOnRequest | null>(null);
  const [declineTarget, setDeclineTarget] = useState<AddOnRequest | null>(null);
  const [approvePricingMode, setApprovePricingMode] = useState<PricingMode>('full');
  const [approveCustomPrice, setApproveCustomPrice] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const { data: paymentEnabled } = useFeatureFlagEnabled('payment_system');
  const isPaymentMode = paymentEnabled === true;

  // Fetch tenant's add-ons
  const { data: tenantAddOns, isLoading } = useQuery({
    queryKey: ['admin', 'tenant-add-ons', tenantNumericId],
    queryFn: () => adminAddOnsApi.listTenantAddOns(tenantNumericId!),
    enabled: !!tenantNumericId,
  });

  // Fetch catalog to determine available add-ons
  const { data: catalog } = useQuery<AddOn[]>({
    queryKey: ['admin', 'add-ons-catalog'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await apiClient<any>('/add-ons');
      return data.addOns || data || [];
    },
    ...QUERY_TIERS.STATIC,
  });

  // Fetch pending add-on requests for this tenant
  const { data: allRequests } = useQuery({
    queryKey: ['admin', 'add-on-requests'],
    queryFn: () => apiClient<AddOnRequest[]>('/admin/add-on-requests'),
    enabled: !!tenantNumericId,
  });

  const pendingRequests = useMemo(
    () => (allRequests ?? []).filter((r) => r.tenantId === tenantNumericId && r.status === 'pending'),
    [allRequests, tenantNumericId],
  );

  // Approve request mutation
  const approveRequestMutation = useMutation({
    mutationFn: (requestId: string) => {
      const giftedPriceCents =
        approvePricingMode === 'free'
          ? 0
          : approvePricingMode === 'custom'
            ? Math.round(parseFloat(approveCustomPrice) * 100)
            : undefined;
      return apiClient(`/admin/add-on-requests/${requestId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ giftedPriceCents }),
      });
    },
    onSuccess: () => {
      showSuccess('Request approved');
      queryClient.invalidateQueries({ queryKey: ['admin', 'add-on-requests'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'tenant-add-ons', tenantNumericId] });
      setApproveTarget(null);
      setApprovePricingMode('full');
      setApproveCustomPrice('');
    },
    onError: (error: Error) => showError('Failed to approve', extractErrorMessage(error)),
  });

  // Decline request mutation
  const declineRequestMutation = useMutation({
    mutationFn: (requestId: string) =>
      apiClient(`/admin/add-on-requests/${requestId}/decline`, {
        method: 'POST',
        body: JSON.stringify({ reason: declineReason }),
      }),
    onSuccess: () => {
      showSuccess('Request declined');
      queryClient.invalidateQueries({ queryKey: ['admin', 'add-on-requests'] });
      setDeclineTarget(null);
      setDeclineReason('');
    },
    onError: (error: Error) => showError('Failed to decline', extractErrorMessage(error)),
  });

  // Available add-ons (not already active for this tenant)
  const activeSlugSet = new Set((tenantAddOns ?? []).filter((ta) => ta.status === 'active').map((ta) => ta.addOn.slug));
  const availableAddOns = (catalog ?? []).filter((a) => a.isActive && !activeSlugSet.has(a.slug));

  // Selected add-on from catalog (for the enable dialog)
  const selectedAddOn = (catalog ?? []).find((a) => a.slug === selectedSlug);

  // Enable mutation
  const enableMutation = useMutation({
    mutationFn: () => {
      const priceCents =
        pricingMode === 'free' ? 0 : pricingMode === 'custom' ? Math.round(parseFloat(customPrice) * 100) : undefined;
      return adminAddOnsApi.enableAddOn(tenantNumericId!, selectedSlug, priceCents);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant-add-ons', tenantNumericId],
      });
      setSelectedSlug('');
      setEnableDialogOpen(false);
      setPricingMode('full');
      setCustomPrice('');
      showSuccess('Add-on enabled');
    },
    onError: (error: Error) => {
      showError('Failed to enable add-on', extractErrorMessage(error));
    },
  });

  // Cancel/revoke mutation
  const revokeMutation = useMutation({
    mutationFn: (slug: string) => adminAddOnsApi.cancelAddOn(tenantNumericId!, slug, 'Revoked by admin'),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'tenant-add-ons', tenantNumericId],
      });
      setRevokeTarget(null);
      showSuccess('Add-on revoked');
    },
    onError: (error: Error) => {
      setRevokeTarget(null);
      showError('Failed to revoke add-on', extractErrorMessage(error));
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3 py-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const activeAddOns = (tenantAddOns ?? []).filter((ta) => ta.status === 'active');
  const cancelledAddOns = (tenantAddOns ?? []).filter((ta) => ta.status === 'cancelled');

  return (
    <div className="space-y-4 py-2">
      {/* Enable add-on section */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-foreground">Enable Add-On</h4>
        <div className="flex items-center gap-2">
          <Select value={selectedSlug} onValueChange={setSelectedSlug}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select add-on to enable" />
            </SelectTrigger>
            <SelectContent>
              {availableAddOns.length === 0 ? (
                <SelectItem value="_none" disabled>
                  All add-ons are already active
                </SelectItem>
              ) : (
                availableAddOns.map((a) => (
                  <SelectItem key={a.slug} value={a.slug}>
                    {a.name} ({formatPrice(a.priceCents)})
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedSlug || selectedSlug === '_none'}
            onClick={() => {
              setPricingMode('full');
              setCustomPrice('');
              setEnableDialogOpen(true);
            }}
          >
            Enable
          </Button>
        </div>
      </div>

      {/* Enable pricing dialog */}
      <Dialog
        open={enableDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEnableDialogOpen(false);
            setPricingMode('full');
            setCustomPrice('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enable {selectedAddOn?.name}</DialogTitle>
            <DialogDescription>
              Catalog price: {selectedAddOn ? formatPrice(selectedAddOn.priceCents) : '--'}/mo. Choose pricing for this
              tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Pricing</Label>
              <Select value={pricingMode} onValueChange={(v) => setPricingMode(v as PricingMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    Full price — {selectedAddOn ? formatPrice(selectedAddOn.priceCents) : '--'}/mo
                  </SelectItem>
                  <SelectItem value="free">Free — gifted at $0</SelectItem>
                  <SelectItem value="custom">Custom price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {pricingMode === 'custom' && (
              <div className="space-y-2">
                <Label>Monthly price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 15"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEnableDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => enableMutation.mutate()}
              loading={enableMutation.isPending}
              disabled={pricingMode === 'custom' && (!customPrice || parseFloat(customPrice) < 0)}
            >
              <Check className="h-4 w-4 mr-1.5" />
              Enable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Approve request dialog */}
      <Dialog
        open={!!approveTarget}
        onOpenChange={(open) => {
          if (!open) {
            setApproveTarget(null);
            setApprovePricingMode('full');
            setApproveCustomPrice('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Approve {approveTarget?.addOn.name}</DialogTitle>
            <DialogDescription>
              Catalog price:{' '}
              {approveTarget?.addOn.priceCents != null ? formatPrice(approveTarget.addOn.priceCents) : 'Custom'}
              /mo. Choose pricing for this tenant.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Pricing</Label>
              <Select value={approvePricingMode} onValueChange={(v) => setApprovePricingMode(v as PricingMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    Full price —{' '}
                    {approveTarget?.addOn.priceCents != null ? formatPrice(approveTarget.addOn.priceCents) : 'Custom'}
                    /mo
                  </SelectItem>
                  <SelectItem value="free">Free — gifted at $0</SelectItem>
                  <SelectItem value="custom">Custom price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {approvePricingMode === 'custom' && (
              <div className="space-y-2">
                <Label>Monthly price ($)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="e.g. 15"
                  value={approveCustomPrice}
                  onChange={(e) => setApproveCustomPrice(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => approveTarget && approveRequestMutation.mutate(approveTarget.id)}
              loading={approveRequestMutation.isPending}
              disabled={approvePricingMode === 'custom' && (!approveCustomPrice || parseFloat(approveCustomPrice) < 0)}
            >
              <Check className="h-4 w-4 mr-1.5" />
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Decline request dialog */}
      <Dialog
        open={!!declineTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeclineTarget(null);
            setDeclineReason('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline {declineTarget?.addOn.name}</DialogTitle>
            <DialogDescription>Provide a reason for declining this request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Reason</Label>
            <Textarea
              placeholder="Why is this request being declined?"
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => declineTarget && declineRequestMutation.mutate(declineTarget.id)}
              loading={declineRequestMutation.isPending}
              disabled={!declineReason.trim()}
            >
              <X className="h-4 w-4 mr-1.5" />
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Active add-ons table */}
      {activeAddOns.length === 0 ? (
        <div className="rounded-md border border-border p-6 text-center">
          <Puzzle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No active add-ons</p>
        </div>
      ) : (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2 hover:text-foreground/80 transition-colors">
            <ChevronDown className="h-4 w-4 transition-transform [[data-state=closed]>&]:rotate-[-90deg]" />
            Active Add-Ons ({activeAddOns.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Add-On</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="hidden sm:table-cell">Source</TableHead>
                  <TableHead className="hidden md:table-cell">Usage</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAddOns.map((ta) => (
                  <TableRow key={ta.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground text-sm">{ta.addOn.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {ta.activatedAt ? `Since ${formatDateTime(ta.activatedAt)}` : ''}
                        </p>
                        {ta.stripeSubscriptionItemId && (
                          <p className="text-2xs text-muted-foreground font-mono flex items-center gap-1 mt-0.5">
                            {ta.stripeSubscriptionItemId}
                            <a
                              href={`https://dashboard.stripe.com/subscription_items/${ta.stripeSubscriptionItemId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-400"
                            >
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="default">Active</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">{formatPrice(ta.priceCents)}</span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="muted" className="capitalize">
                        {ta.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {ta.usageLimit != null ? (
                        <span className="text-sm font-mono text-muted-foreground">
                          {ta.currentUsage}/{ta.usageLimit}
                          {ta.usageLimitUnit ? ` ${ta.usageLimitUnit}` : ''}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlimited</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="destructive" size="sm" onClick={() => setRevokeTarget(ta)}>
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Previously cancelled — sub-section within active add-ons */}
            {cancelledAddOns.length > 0 && (
              <div className="pt-3 border-t border-border mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Previously Cancelled ({cancelledAddOns.length})
                </p>
                <div className="space-y-1">
                  {cancelledAddOns.map((ta) => (
                    <div
                      key={ta.id}
                      className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">{ta.addOn.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Cancelled {ta.cancelledAt ? formatDateTime(ta.cancelledAt) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Requests — pending add-on requests from tenant */}
      {pendingRequests.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-2 hover:text-foreground/80 transition-colors">
            <ChevronDown className="h-4 w-4 transition-transform [[data-state=closed]>&]:rotate-[-90deg]" />
            Requests ({pendingRequests.length})
          </CollapsibleTrigger>
          <CollapsibleContent>
            {isPaymentMode && (
              <p className="text-xs text-muted-foreground mb-2 italic">
                Payment system is enabled. These requests are from add-ons without a configured provider price or from
                tenants without an active subscription.
              </p>
            )}
            <div className="rounded-md border border-border divide-y divide-border">
              {pendingRequests.map((req) => (
                <div key={req.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-foreground">{req.addOn.name}</span>
                      <Badge variant="outline" className="text-2xs">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        Requested{' '}
                        {new Date(req.requestedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </span>
                    </div>
                    {req.requestNote && (
                      <p className="text-xs text-muted-foreground mt-1 italic">&quot;{req.requestNote}&quot;</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        setApprovePricingMode('full');
                        setApproveCustomPrice('');
                        setApproveTarget(req);
                      }}
                    >
                      <Check className="h-3.5 w-3.5 mr-1.5" />
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setDeclineReason('');
                        setDeclineTarget(req);
                      }}
                    >
                      <X className="h-3.5 w-3.5 mr-1.5" />
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Revoke confirmation dialog */}
      <AlertDialog
        open={!!revokeTarget}
        onOpenChange={(open) => {
          if (!open) setRevokeTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Add-On</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke{' '}
              <span className="font-medium text-foreground">{revokeTarget?.addOn.name}</span>? This will immediately
              disable the feature for this tenant.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (revokeTarget) {
                  revokeMutation.mutate(revokeTarget.addOn.slug);
                }
              }}
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
