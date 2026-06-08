'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Progress } from '@sally/ui/components/ui/progress';
import { Separator } from '@sally/ui/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
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
  AlertTriangle,
  Calendar,
  ChevronDown,
  CreditCard,
  DollarSign,
  ExternalLink,
  Pause,
  Play,
  Plus,
} from 'lucide-react';
import { showSuccess, showError } from '@sally/ui';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { queryKeys } from '@/shared/constants';
import { plansApi } from '@/features/platform/plans/api';
import {
  useAdminTenantBilling,
  useAdminCreateSubscription,
  useAdminAddCredit,
  useAdminOverridePrice,
  useAdminCancelImmediately,
  useAdminPauseBilling,
  useAdminResumeBilling,
  useAdminExtendTrial,
  useAdminChangeSubscriptionPlan,
} from '../hooks/use-admin-billing';
import { TenantAddOnsTab } from './tenant-add-ons-tab';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TenantPlanBillingTabProps {
  tenantId: string;
  tenantNumericId: number | undefined;
  tenantPlan?: string;
  planData?: {
    plan: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    planConfig: any;
    vehicleCount: number;
    fleetLimit: number | null;
    fleetLimitWarning: boolean;
    planAssignedAt: string | null;
    planAssignedBy: string | null;
    planEvents: Array<{
      id: string | number;
      fromPlan: string | null;
      toPlan: string;
      changedBy: string;
      reason: string | null;
      createdAt: string;
    }>;
  };
  isPlanLoading?: boolean;
  onPlanChanged?: () => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLAN_OPTIONS = [
  { value: 'TRIAL', label: 'Trial' },
  { value: 'TRIAL_EXPIRED', label: 'Trial Expired' },
  { value: 'STARTER', label: 'Haul (Starter)' },
  { value: 'PROFESSIONAL', label: 'Fleet (Professional)' },
  { value: 'ENTERPRISE', label: 'Freight Force (Enterprise)' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const SUBSCRIBABLE_PLANS = [
  { value: 'STARTER', label: 'Haul (Starter)' },
  { value: 'PROFESSIONAL', label: 'Fleet (Professional)' },
  { value: 'ENTERPRISE', label: 'Freight Force (Enterprise)' },
];

const STATUS_VARIANTS: Record<string, 'default' | 'destructive' | 'muted' | 'outline'> = {
  ACTIVE: 'default',
  TRIALING: 'outline',
  PAST_DUE: 'destructive',
  CANCELED: 'muted',
  SUSPENDED: 'destructive',
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function getPlanLabel(plan: string): string {
  return PLAN_OPTIONS.find((p) => p.value === plan)?.label ?? plan;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantPlanBillingTab({
  tenantId,
  tenantNumericId,
  tenantPlan,
  planData,
  isPlanLoading,
  onPlanChanged,
}: TenantPlanBillingTabProps) {
  const { formatDateTime } = useFormatters();
  const queryClient = useQueryClient();
  const { data, isLoading } = useAdminTenantBilling(tenantNumericId);

  // --- Mutations (billing hooks) ---
  const createSubscription = useAdminCreateSubscription(tenantNumericId);
  const addCredit = useAdminAddCredit(tenantNumericId);
  const overridePrice = useAdminOverridePrice(tenantNumericId);
  const cancelImmediately = useAdminCancelImmediately(tenantNumericId);
  const pauseBilling = useAdminPauseBilling(tenantNumericId);
  const resumeBilling = useAdminResumeBilling(tenantNumericId);
  const extendTrial = useAdminExtendTrial(tenantNumericId);
  const changeSubscriptionPlan = useAdminChangeSubscriptionPlan(tenantNumericId);

  // --- Plan assignment mutation (inline) ---
  const assignPlanMutation = useMutation({
    mutationFn: (vars: { plan: string; reason?: string }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      plansApi.assignPlan({ tenantId, plan: vars.plan as any, reason: vars.reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.admin.tenantBilling(String(tenantNumericId)),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenantPlan });
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.tenants });
      onPlanChanged?.();
      showSuccess('Plan assigned');
    },
    onError: (error: Error) => {
      showError('Failed to assign plan', extractErrorMessage(error));
    },
  });

  // --- Form state: Plan assignment ---
  const [assignPlan, setAssignPlan] = useState('');
  const [assignReason, setAssignReason] = useState('');

  // --- Form state: Create subscription ---
  const [subPlan, setSubPlan] = useState('');
  const [subQuantity, setSubQuantity] = useState('1');
  const [subCustomPrice, setSubCustomPrice] = useState('');

  // --- Form state: Change subscription plan ---
  const [changePlan, setChangePlan] = useState('');
  const [changeQuantity, setChangeQuantity] = useState('');

  // --- Form state: Add credit ---
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('');

  // --- Form state: Override price ---
  const [newPrice, setNewPrice] = useState('');

  // --- Form state: Extend trial ---
  const [trialDays, setTrialDays] = useState('30');

  // --- Add-Ons collapsible ---
  const [addOnsOpen, setAddOnsOpen] = useState(true);

  // --- Loading skeleton ---
  if (isLoading || isPlanLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const subscription = data?.subscription;
  const wallet = data?.wallet;
  const paymentMethods = data?.paymentMethods ?? [];
  const recentInvoices = data?.recentInvoices ?? [];
  const isTrial = tenantPlan === 'TRIAL' || tenantPlan === 'TRIAL_EXPIRED';
  const hasSubscription = !!subscription;
  const subscriptionNotCanceled = hasSubscription && subscription.status !== 'CANCELED';
  const hasMismatch = subscriptionNotCanceled && tenantPlan && subscription.plan !== tenantPlan;

  // --- Handlers ---

  const handleAssignPlan = () => {
    if (!assignPlan) return;
    assignPlanMutation.mutate(
      { plan: assignPlan, reason: assignReason || undefined },
      {
        onSuccess: () => {
          setAssignPlan('');
          setAssignReason('');
        },
      },
    );
  };

  const handleCreateSubscription = () => {
    if (!subPlan || !subQuantity) return;
    createSubscription.mutate(
      {
        plan: subPlan,
        quantity: parseInt(subQuantity, 10),
        customPriceCents: subCustomPrice ? Math.round(parseFloat(subCustomPrice) * 100) : undefined,
      },
      {
        onSuccess: () => {
          setSubPlan('');
          setSubQuantity('1');
          setSubCustomPrice('');
        },
      },
    );
  };

  const handleChangeSubscriptionPlan = () => {
    if (!changePlan) return;
    changeSubscriptionPlan.mutate(
      {
        plan: changePlan,
        quantity: changeQuantity ? parseInt(changeQuantity, 10) : undefined,
      },
      {
        onSuccess: () => {
          setChangePlan('');
          setChangeQuantity('');
        },
      },
    );
  };

  const handleAddCredit = () => {
    if (!creditAmount || !creditReason) return;
    addCredit.mutate(
      {
        amountCents: Math.round(parseFloat(creditAmount) * 100),
        reason: creditReason,
      },
      {
        onSuccess: () => {
          setCreditAmount('');
          setCreditReason('');
        },
      },
    );
  };

  const handleOverridePrice = () => {
    if (!newPrice) return;
    overridePrice.mutate(Math.round(parseFloat(newPrice) * 100), {
      onSuccess: () => setNewPrice(''),
    });
  };

  // --- Fleet usage ---
  const vehicleCount = planData?.vehicleCount ?? 0;
  const fleetLimit = planData?.fleetLimit;
  const fleetPct = fleetLimit && fleetLimit > 0 ? Math.min(Math.round((vehicleCount / fleetLimit) * 100), 100) : 0;

  return (
    <div className="space-y-6">
      {/* ================================================================ */}
      {/* SECTION 1: Plan & Access                                        */}
      {/* ================================================================ */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Plan & Access</h4>

        <div className="rounded-md border border-border p-4 space-y-4">
          {/* Current plan display */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Current Plan</span>
              <Badge variant={STATUS_VARIANTS[tenantPlan ?? ''] ?? 'outline'}>
                {getPlanLabel(tenantPlan ?? 'UNKNOWN')}
              </Badge>
            </div>

            {planData?.planAssignedBy && (
              <p className="text-xs text-muted-foreground">
                Set by: {planData.planAssignedBy}
                {planData.planAssignedAt && ` \u00B7 ${formatDateTime(planData.planAssignedAt)}`}
              </p>
            )}
          </div>

          {/* Fleet usage progress bar */}
          {fleetLimit !== null && fleetLimit !== undefined && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Fleet Usage</span>
                <span>
                  {vehicleCount} / {fleetLimit} vehicles
                </span>
              </div>
              <Progress value={fleetPct} className="h-2" />
              {planData?.fleetLimitWarning && (
                <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Approaching fleet limit
                </p>
              )}
            </div>
          )}

          {/* Change Plan form */}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Change Plan</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">New Plan</Label>
                <Select value={assignPlan} onValueChange={setAssignPlan}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reason (optional)</Label>
                <Textarea
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  placeholder="Reason for plan change..."
                  className="h-8 min-h-[2rem] resize-none"
                  rows={1}
                />
              </div>
            </div>
            <Button size="sm" onClick={handleAssignPlan} loading={assignPlanMutation.isPending} disabled={!assignPlan}>
              Save Plan
            </Button>
          </div>
        </div>
      </div>

      <Separator />

      {/* ================================================================ */}
      {/* SECTION 2: Subscription (Stripe)                                */}
      {/* ================================================================ */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Subscription</h4>

        {/* Mismatch warning */}
        {hasMismatch && (
          <div className="rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Plan mismatch: tenant plan is <strong>{tenantPlan}</strong> but subscription is{' '}
              <strong>{subscription!.plan}</strong>.
            </p>
          </div>
        )}

        {hasSubscription && subscriptionNotCanceled ? (
          <div className="rounded-md border border-border p-4 space-y-3">
            {/* Subscription header */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{getPlanLabel(subscription.plan)}</span>
                  <Badge variant={STATUS_VARIANTS[subscription.status] ?? 'muted'}>{subscription.status}</Badge>
                  {subscription.cancelAtPeriodEnd && <Badge variant="destructive">Cancels at period end</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {subscription.quantity} unit
                  {subscription.quantity !== 1 ? 's' : ''} &times; {formatCents(subscription.unitPriceCents)}/mo ={' '}
                  {formatCents(subscription.quantity * subscription.unitPriceCents)}
                  /mo
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>Period: {formatDateTime(subscription.currentPeriodStart)}</p>
                <p>&rarr; {formatDateTime(subscription.currentPeriodEnd)}</p>
              </div>
            </div>

            {/* Stripe link */}
            <p className="text-xs text-muted-foreground font-mono flex items-center gap-1">
              <CreditCard className="h-3 w-3" />
              {subscription.providerSubscriptionId}
              <a
                href={`https://dashboard.stripe.com/subscriptions/${subscription.providerSubscriptionId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:text-blue-400"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            </p>

            {/* Subscription Actions: Pause / Resume / Cancel */}
            <div className="flex gap-2 pt-1">
              {subscription.status === 'ACTIVE' && !subscription.cancelAtPeriodEnd && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => pauseBilling.mutate()}
                  loading={pauseBilling.isPending}
                >
                  <Pause className="h-3.5 w-3.5 mr-1" />
                  Pause Billing
                </Button>
              )}
              {subscription.cancelAtPeriodEnd && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resumeBilling.mutate()}
                  loading={resumeBilling.isPending}
                >
                  <Play className="h-3.5 w-3.5 mr-1" />
                  Resume Billing
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    Cancel Now
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel Subscription Immediately</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will cancel the Stripe subscription right now (not at period end). The tenant will lose
                      access immediately. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Subscription</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => cancelImmediately.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {cancelImmediately.isPending ? 'Canceling...' : 'Cancel Now'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {/* Change Subscription Plan */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Change Subscription Plan</p>
              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">New Plan</Label>
                  <Select value={changePlan} onValueChange={setChangePlan}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBSCRIBABLE_PLANS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 w-24">
                  <Label className="text-xs">Qty (optional)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={changeQuantity}
                    onChange={(e) => setChangeQuantity(e.target.value)}
                    placeholder={String(subscription.quantity)}
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleChangeSubscriptionPlan}
                  loading={changeSubscriptionPlan.isPending}
                  disabled={!changePlan}
                  className="h-8"
                >
                  Change
                </Button>
              </div>
            </div>

            {/* Custom pricing override */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Custom Pricing</p>
              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="override-price" className="text-xs">
                    Unit price ($/mo)
                  </Label>
                  <Input
                    id="override-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder={`Current: ${(subscription.unitPriceCents / 100).toFixed(2)}`}
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleOverridePrice}
                  loading={overridePrice.isPending}
                  disabled={!newPrice}
                  className="h-8"
                >
                  Update
                </Button>
              </div>
            </div>
          </div>
        ) : hasSubscription && subscription.status === 'CANCELED' ? (
          /* Subscription is canceled — show status + create new */
          <div className="space-y-3">
            <div className="rounded-md border border-border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{getPlanLabel(subscription.plan)}</span>
                <Badge variant="muted">CANCELED</Badge>
              </div>
              <p className="text-xs text-muted-foreground">This subscription was canceled. Create a new one below.</p>
            </div>

            {/* Create New Subscription form */}
            <div className="rounded-md border border-dashed border-border p-4 space-y-3">
              <p className="text-sm text-muted-foreground">Create a new subscription to resume billing.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Plan</Label>
                  <Select value={subPlan} onValueChange={setSubPlan}>
                    <SelectTrigger className="h-8">
                      <SelectValue placeholder="Select plan" />
                    </SelectTrigger>
                    <SelectContent>
                      {SUBSCRIBABLE_PLANS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Trucks</Label>
                  <Input
                    type="number"
                    min="1"
                    value={subQuantity}
                    onChange={(e) => setSubQuantity(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Custom $/unit (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={subCustomPrice}
                    onChange={(e) => setSubCustomPrice(e.target.value)}
                    placeholder="Catalog price"
                    className="h-8"
                  />
                </div>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={!subPlan || !subQuantity}>
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Create Subscription
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Create Subscription</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will create a Stripe subscription for this tenant on the{' '}
                      <strong>{SUBSCRIBABLE_PLANS.find((p) => p.value === subPlan)?.label ?? subPlan}</strong> plan with{' '}
                      {subQuantity} truck
                      {parseInt(subQuantity) !== 1 ? 's' : ''}.
                      {subCustomPrice && ` Custom price: $${parseFloat(subCustomPrice).toFixed(2)}/unit/mo.`} The tenant
                      will be billed immediately.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleCreateSubscription} disabled={createSubscription.isPending}>
                      {createSubscription.isPending ? 'Creating...' : 'Confirm'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ) : (
          /* No Subscription at all — Create one */
          <div className="rounded-md border border-dashed border-border p-4 space-y-3">
            <p className="text-sm text-muted-foreground">No active subscription. Create one to start billing.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Plan</Label>
                <Select value={subPlan} onValueChange={setSubPlan}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select plan" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBSCRIBABLE_PLANS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Trucks</Label>
                <Input
                  type="number"
                  min="1"
                  value={subQuantity}
                  onChange={(e) => setSubQuantity(e.target.value)}
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Custom $/unit (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={subCustomPrice}
                  onChange={(e) => setSubCustomPrice(e.target.value)}
                  placeholder="Catalog price"
                  className="h-8"
                />
              </div>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" disabled={!subPlan || !subQuantity}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Create Subscription
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Create Subscription</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will create a Stripe subscription for this tenant on the{' '}
                    <strong>{SUBSCRIBABLE_PLANS.find((p) => p.value === subPlan)?.label ?? subPlan}</strong> plan with{' '}
                    {subQuantity} truck
                    {parseInt(subQuantity) !== 1 ? 's' : ''}.
                    {subCustomPrice && ` Custom price: $${parseFloat(subCustomPrice).toFixed(2)}/unit/mo.`} The tenant
                    will be billed immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCreateSubscription} disabled={createSubscription.isPending}>
                    {createSubscription.isPending ? 'Creating...' : 'Confirm'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      <Separator />

      {/* ================================================================ */}
      {/* SECTION 3: Add-Ons                                              */}
      {/* ================================================================ */}
      <Collapsible open={addOnsOpen} onOpenChange={setAddOnsOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between py-1">
          <h4 className="text-sm font-medium text-foreground">Add-Ons</h4>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${addOnsOpen ? 'rotate-180' : ''}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <TenantAddOnsTab tenantId={tenantId} tenantNumericId={tenantNumericId} />
        </CollapsibleContent>
      </Collapsible>

      <Separator />

      {/* ================================================================ */}
      {/* SECTION 4: Wallet & Credits                                     */}
      {/* ================================================================ */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Wallet & Credits</h4>
        <div className="rounded-md border border-border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Balance</span>
            <span className="text-lg font-semibold text-foreground">
              {wallet ? formatCents(wallet.balanceCents) : '$0.00'}
            </span>
          </div>

          {/* Add credit form */}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Gift Credit</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="credit-amount" className="text-xs">
                  Amount ($)
                </Label>
                <Input
                  id="credit-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-8"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="credit-reason" className="text-xs">
                  Reason
                </Label>
                <Input
                  id="credit-reason"
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder="e.g. Onboarding bonus"
                  className="h-8"
                />
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleAddCredit}
              loading={addCredit.isPending}
              disabled={!creditAmount || !creditReason}
            >
              <DollarSign className="h-3.5 w-3.5 mr-1" />
              Add Credit
            </Button>
          </div>

          {/* Recent wallet transactions */}
          {wallet?.transactions && wallet.transactions.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Recent Transactions</p>
              <div className="space-y-1">
                {wallet.transactions.slice(0, 5).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground truncate max-w-[60%]">{tx.description || tx.type}</span>
                    <span
                      className={
                        tx.amountCents >= 0
                          ? 'text-green-500 dark:text-green-400 font-medium'
                          : 'text-red-500 dark:text-red-400 font-medium'
                      }
                    >
                      {tx.amountCents >= 0 ? '+' : ''}
                      {formatCents(tx.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Separator />

      {/* ================================================================ */}
      {/* SECTION 5: Trial Management                                     */}
      {/* ================================================================ */}
      {isTrial && (
        <>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Trial Management</h4>
            <div className="rounded-md border border-border p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Trial ends</span>
                <span className="font-medium text-foreground">
                  {data?.tenant.trialEndsAt ? formatDateTime(data.tenant.trialEndsAt) : 'Not set'}
                </span>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label htmlFor="trial-days" className="text-xs">
                    Extend by (days)
                  </Label>
                  <Input
                    id="trial-days"
                    type="number"
                    min="1"
                    value={trialDays}
                    onChange={(e) => setTrialDays(e.target.value)}
                    className="h-8"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => extendTrial.mutate(parseInt(trialDays, 10))}
                  loading={extendTrial.isPending}
                  disabled={!trialDays || parseInt(trialDays) < 1}
                  className="h-8"
                >
                  <Calendar className="h-3.5 w-3.5 mr-1" />
                  Extend
                </Button>
              </div>
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* ================================================================ */}
      {/* SECTION 6: Recent Invoices                                      */}
      {/* ================================================================ */}
      {recentInvoices.length > 0 && (
        <>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Recent Invoices</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInvoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(inv.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={inv.status === 'PAID' ? 'default' : inv.status === 'OPEN' ? 'outline' : 'muted'}>
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatCents(inv.amountDueCents)}</TableCell>
                    <TableCell className="text-right">
                      {inv.hostedInvoiceUrl && (
                        <a
                          href={inv.hostedInvoiceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 hover:text-blue-400"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Separator />
        </>
      )}

      {/* Payment Methods */}
      {paymentMethods.length > 0 && (
        <>
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-foreground">Payment Methods</h4>
            <div className="space-y-2">
              {paymentMethods.map((pm) => (
                <div
                  key={pm.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <CreditCard className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-foreground">
                      {pm.brand} &bull;&bull;&bull;&bull; {pm.last4}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {pm.expMonth}/{pm.expYear}
                    </span>
                  </div>
                  {pm.isDefault && (
                    <Badge variant="outline" className="text-xs">
                      Default
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <Separator />
        </>
      )}

      {/* ================================================================ */}
      {/* SECTION 7: Plan History                                         */}
      {/* ================================================================ */}
      {planData?.planEvents && planData.planEvents.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-foreground">Plan History</h4>
          <div className="space-y-2">
            {planData.planEvents.slice(0, 5).map((event) => (
              <div key={event.id} className="rounded-md border border-border px-3 py-2 space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Badge variant="muted" className="text-xs">
                      {getPlanLabel(event.fromPlan ?? '')}
                    </Badge>
                    <span className="text-muted-foreground">&rarr;</span>
                    <Badge variant="outline" className="text-xs">
                      {getPlanLabel(event.toPlan)}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  by {event.changedBy}
                  {event.reason && <span className="italic"> &mdash; {event.reason}</span>}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
