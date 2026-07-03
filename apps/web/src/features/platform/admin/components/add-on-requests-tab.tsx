'use client';

import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@app/ui/components/ui/tabs';
import { Input } from '@app/ui/components/ui/input';
import { Label } from '@app/ui/components/ui/label';
import { Textarea } from '@app/ui/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@app/ui/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { Check, X, Clock, Package, Ban, Info } from 'lucide-react';
import { apiClient } from '@appshore/web-core/shared/lib/api';
import { showSuccess, showError } from '@appshore/web-core/shared/lib/toast';
import { useFeatureFlagEnabled } from '@/features/platform/feature-flags/hooks/use-feature-flags';
import { queryKeys } from '@appshore/web-core/shared/constants';
import { extractErrorMessage } from '@appshore/web-core/shared/lib/error-utils';

type RequestStatus = 'pending' | 'approved' | 'declined';
type DisplayStatus = RequestStatus | 'cancelled';
type FilterStatus = DisplayStatus | 'all';
type PricingMode = 'full' | 'free' | 'custom';

interface AddOnRequest {
  id: string;
  tenantId: number;
  addOnId: string;
  status: RequestStatus;
  requestedByUserId: number;
  requestedAt: string;
  requestNote: string | null;
  reviewedByUserId: number | null;
  reviewedAt: string | null;
  declineReason: string | null;
  giftedPriceCents: number | null;
  addOnActive?: boolean;
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

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(0)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const STATUS_CONFIG: Record<
  DisplayStatus,
  { icon: typeof Check; label: string; variant: 'outline' | 'default' | 'destructive' }
> = {
  pending: { icon: Clock, label: 'Pending', variant: 'outline' },
  approved: { icon: Check, label: 'Active', variant: 'default' },
  cancelled: { icon: Ban, label: 'Cancelled', variant: 'destructive' },
  declined: { icon: X, label: 'Declined', variant: 'outline' },
};

/** Derive display status: approved + not active = cancelled */
function getDisplayStatus(req: AddOnRequest): DisplayStatus {
  if (req.status === 'approved' && req.addOnActive === false) return 'cancelled';
  return req.status;
}

// ── Approve Dialog ───────────────────────────────────────────────────────────
function ApproveDialog({
  request,
  open,
  onOpenChange,
}: {
  request: AddOnRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [pricingMode, setPricingMode] = useState<PricingMode>('full');
  const [customPrice, setCustomPrice] = useState('');
  const catalogPrice = request.addOn.priceCents ?? 0;

  const { mutate: approve, isPending } = useMutation({
    mutationFn: () => {
      const giftedPriceCents =
        pricingMode === 'free' ? 0 : pricingMode === 'custom' ? Math.round(parseFloat(customPrice) * 100) : undefined;
      return apiClient(`/admin/add-on-requests/${request.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ giftedPriceCents }),
      });
    },
    onSuccess: () => {
      const label = pricingMode === 'free' ? ' (free)' : pricingMode === 'custom' ? ` ($${customPrice}/mo)` : '';
      showSuccess(`${request.addOn.name} approved for ${request.tenant?.companyName}${label}`);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.addOnRequests });
      onOpenChange(false);
    },
    onError: (error: Error) => showError('Failed to approve', extractErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approve {request.addOn.name}</DialogTitle>
          <DialogDescription>
            For {request.tenant?.companyName}. Catalog price: {formatPrice(catalogPrice)}/mo.
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
                <SelectItem value="full">Full price — {formatPrice(catalogPrice)}/mo</SelectItem>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => approve()}
            loading={isPending}
            disabled={pricingMode === 'custom' && (!customPrice || parseFloat(customPrice) < 0)}
          >
            <Check className="h-4 w-4 mr-1.5" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Decline Dialog ───────────────────────────────────────────────────────────
function DeclineDialog({
  request,
  open,
  onOpenChange,
}: {
  request: AddOnRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const { mutate: decline, isPending } = useMutation({
    mutationFn: () =>
      apiClient(`/admin/add-on-requests/${request.id}/decline`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => {
      showSuccess(`${request.addOn.name} declined`);
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.addOnRequests });
      onOpenChange(false);
    },
    onError: (error: Error) => showError('Failed to decline', extractErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Decline {request.addOn.name}</DialogTitle>
          <DialogDescription>Request from {request.tenant?.companyName}. Provide a reason.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Reason</Label>
          <Textarea
            placeholder="Why is this request being declined?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => decline()} loading={isPending} disabled={!reason.trim()}>
            <X className="h-4 w-4 mr-1.5" />
            Decline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Request Row ──────────────────────────────────────────────────────────────
function RequestRow({ request, isPaymentMode }: { request: AddOnRequest; isPaymentMode: boolean }) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const displayStatus = getDisplayStatus(request);
  const StatusIcon = STATUS_CONFIG[displayStatus].icon;
  const isPending = displayStatus === 'pending';

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{request.addOn.name}</span>
            {request.addOn.priceCents != null && (
              <span className="text-xs text-muted-foreground">
                {request.giftedPriceCents != null && (displayStatus === 'approved' || displayStatus === 'cancelled')
                  ? request.giftedPriceCents === 0
                    ? 'Free'
                    : `${formatPrice(request.giftedPriceCents)}/mo (gifted)`
                  : `${formatPrice(request.addOn.priceCents)}/mo`}
              </span>
            )}
            <Badge variant={STATUS_CONFIG[displayStatus].variant} className="text-2xs">
              <StatusIcon className="h-3 w-3 mr-1" />
              {STATUS_CONFIG[displayStatus].label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            <span className="font-medium text-foreground/80">
              {request.tenant?.companyName ?? `Tenant #${request.tenantId}`}
            </span>
            {' \u00b7 '}
            {formatDate(request.requestedAt)}
            {request.reviewedAt && ` \u00b7 reviewed ${formatDate(request.reviewedAt)}`}
          </p>
          {request.requestNote && (
            <p className="text-xs text-muted-foreground mt-1 italic">&quot;{request.requestNote}&quot;</p>
          )}
          {request.declineReason && (
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">Reason: {request.declineReason}</p>
          )}
        </div>

        {/* Actions — hidden when payment_system is active */}
        {!isPaymentMode && (
          <div className="flex items-center gap-2 shrink-0">
            {isPending && (
              <>
                <Button size="sm" onClick={() => setApproveOpen(true)}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Approve
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeclineOpen(true)}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Decline
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {!isPaymentMode && isPending && (
        <>
          <ApproveDialog request={request} open={approveOpen} onOpenChange={setApproveOpen} />
          <DeclineDialog request={request} open={declineOpen} onOpenChange={setDeclineOpen} />
        </>
      )}
    </>
  );
}

// ── Add-on Requests Tab (embedded in Plans page) ─────────────────────────────
export function AddOnRequestsTab() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [tenantFilter, setTenantFilter] = useState<string>('all');
  const { data: paymentEnabled } = useFeatureFlagEnabled('payment_system');
  const isPaymentMode = paymentEnabled === true;

  const { data: requests, isLoading } = useQuery({
    queryKey: queryKeys.admin.addOnRequests,
    queryFn: () => apiClient<AddOnRequest[]>('/admin/add-on-requests'),
    refetchInterval: 30_000,
  });

  // Extract unique tenants for filter dropdown
  const tenants = useMemo(() => {
    if (!requests) return [];
    const map = new Map<number, string>();
    for (const r of requests) {
      if (r.tenant) map.set(r.tenantId, r.tenant.companyName);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [requests]);

  // Apply both filters using display status
  const filtered = useMemo(() => {
    let result = requests ?? [];
    if (statusFilter !== 'all') {
      result = result.filter((r) => getDisplayStatus(r) === statusFilter);
    }
    if (tenantFilter !== 'all') {
      result = result.filter((r) => r.tenantId === parseInt(tenantFilter, 10));
    }
    return result;
  }, [requests, statusFilter, tenantFilter]);

  const pendingCount = requests?.filter((r) => getDisplayStatus(r) === 'pending').length ?? 0;
  const activeCount = requests?.filter((r) => getDisplayStatus(r) === 'approved').length ?? 0;
  const cancelledCount = requests?.filter((r) => getDisplayStatus(r) === 'cancelled').length ?? 0;
  const declinedCount = requests?.filter((r) => getDisplayStatus(r) === 'declined').length ?? 0;
  const totalCount = requests?.length ?? 0;

  return (
    <div className="max-w-4xl mt-6">
      <div className="mb-5">
        <p className="text-sm text-muted-foreground">
          {isPaymentMode
            ? 'Request history. Tenants activate add-ons directly via self-service billing.'
            : 'Review and approve add-on requests from tenants.'}
        </p>
      </div>

      {isPaymentMode && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-3 text-sm text-blue-800 dark:text-blue-200">
          <Info className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <span className="font-medium">Self-service billing is active.</span> Tenants activate and cancel add-ons
            directly. This tab shows request history only. To manage a tenant&apos;s add-ons, go to Tenants &rarr;
            select tenant &rarr; Add-Ons tab.
          </div>
        </div>
      )}

      {/* Filters row */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as FilterStatus)} className="flex-1">
          <TabsList>
            <TabsTrigger value="all" className="text-xs">
              All{totalCount > 0 && ` (${totalCount})`}
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-xs">
              Pending{pendingCount > 0 && ` (${pendingCount})`}
            </TabsTrigger>
            <TabsTrigger value="approved" className="text-xs">
              Active{activeCount > 0 && ` (${activeCount})`}
            </TabsTrigger>
            <TabsTrigger value="cancelled" className="text-xs">
              Cancelled{cancelledCount > 0 && ` (${cancelledCount})`}
            </TabsTrigger>
            <TabsTrigger value="declined" className="text-xs">
              Declined{declinedCount > 0 && ` (${declinedCount})`}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {tenants.length > 1 && (
          <Select value={tenantFilter} onValueChange={setTenantFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue placeholder="All tenants" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tenants</SelectItem>
              {tenants.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="p-5 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-8 w-20 rounded-md" />
              </div>
            ))}
          </CardContent>
        </Card>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm font-medium text-foreground">
              {statusFilter === 'all' && tenantFilter === 'all' ? 'No requests yet' : 'No matching requests'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {statusFilter === 'all' && tenantFilter === 'all'
                ? "When tenants request add-ons, they'll appear here."
                : 'Try adjusting the filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {filtered.map((req) => (
              <RequestRow key={req.id} request={req} isPaymentMode={isPaymentMode} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
