'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Switch } from '@sally/ui/components/ui/switch';
import { Separator } from '@sally/ui/components/ui/separator';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@sally/ui/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { Crown, Users, Truck, Sparkles, Puzzle, Pencil, Check, X } from 'lucide-react';
import { showSuccess, showError } from '@sally/ui';
import { usePlansAdmin } from '@/features/platform/plans/hooks/use-plans-admin';
import { AddOnRequestsTab } from '@/features/platform/admin/components/add-on-requests-tab';
import { plansApi } from '@/features/platform/plans';
import { adminAddOnsApi } from '@/features/platform/admin/api';
import { apiClient } from '@/shared/lib/api/client';
import type { PlanConfig, PlanEntitlement } from '@sally/shared-types';
import { QUERY_TIERS } from '@/shared/config/query-tiers';
import { extractErrorMessage } from '@/shared/lib/error-utils';

// ---------- helpers ----------

function formatPrice(pricePerUnit: number | null): string {
  if (pricePerUnit === null || pricePerUnit === undefined) return 'Custom';
  if (pricePerUnit === 0) return 'Free';
  return (pricePerUnit / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function formatLimit(limit: number | null): string {
  if (limit === null || limit === undefined) return 'Unlimited';
  return limit.toLocaleString();
}

// ---------- generic inline editor ----------

interface InlineEditorProps {
  value: string | null | undefined;
  onSave: (value: string | null) => Promise<void>;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  mono?: boolean;
}

function InlineEditor({
  value,
  onSave,
  placeholder = 'Enter value...',
  className = '',
  inputClassName = '',
  mono = false,
}: InlineEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraft(value ?? '');
      setIsEditing(true);
    },
    [value],
  );

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  }, []);

  const handleSave = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      const trimmed = draft.trim() || null;
      if (trimmed === (value ?? null)) {
        setIsEditing(false);
        return;
      }
      setSaving(true);
      try {
        await onSave(trimmed);
        setIsEditing(false);
      } finally {
        setSaving(false);
      }
    },
    [draft, onSave, value],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') handleSave(e);
      if (e.key === 'Escape') setIsEditing(false);
    },
    [handleSave],
  );

  if (isEditing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`h-7 text-xs ${mono ? 'font-mono' : ''} w-48 ${inputClassName}`}
          autoFocus
        />
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={saving}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel} disabled={saving}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-1.5 group/inline ${className}`}>
      {value ? (
        <span className={`text-sm ${mono ? 'font-mono' : ''} text-foreground truncate max-w-[220px]`}>{value}</span>
      ) : (
        <span className="text-sm text-muted-foreground italic">{placeholder}</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover/inline:opacity-100 transition-opacity"
        onClick={handleEdit}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ---------- inline number editor ----------

interface InlineNumberEditorProps {
  value: number | null | undefined;
  onSave: (value: number | null) => Promise<void>;
  placeholder?: string;
  formatDisplay?: (v: number | null) => string;
  allowNull?: boolean;
  nullLabel?: string;
  min?: number;
}

function InlineNumberEditor({
  value,
  onSave,
  placeholder = '0',
  formatDisplay,
  allowNull = false,
  nullLabel = 'Unlimited',
  min = 0,
}: InlineNumberEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value?.toString() ?? '');
  const [isUnlimited, setIsUnlimited] = useState(value === null || value === undefined);
  const [saving, setSaving] = useState(false);

  const handleEdit = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setDraft(value?.toString() ?? '');
      setIsUnlimited(value === null || value === undefined);
      setIsEditing(true);
    },
    [value],
  );

  const handleCancel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
  }, []);

  const handleSave = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      let newValue: number | null;
      if (allowNull && isUnlimited) {
        newValue = null;
      } else {
        const parsed = parseInt(draft, 10);
        if (isNaN(parsed) || parsed < min) {
          setIsEditing(false);
          return;
        }
        newValue = parsed;
      }
      if (newValue === (value ?? null)) {
        setIsEditing(false);
        return;
      }
      setSaving(true);
      try {
        await onSave(newValue);
        setIsEditing(false);
      } finally {
        setSaving(false);
      }
    },
    [draft, isUnlimited, allowNull, onSave, value, min],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation();
      if (e.key === 'Enter') handleSave(e);
      if (e.key === 'Escape') setIsEditing(false);
    },
    [handleSave],
  );

  if (isEditing) {
    return (
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {allowNull && (
          <div className="flex items-center gap-1.5 mr-1">
            <Checkbox
              id="unlimited-check"
              checked={isUnlimited}
              onCheckedChange={(checked) => setIsUnlimited(checked === true)}
            />
            <Label htmlFor="unlimited-check" className="text-xs text-muted-foreground cursor-pointer">
              {nullLabel}
            </Label>
          </div>
        )}
        {!isUnlimited && (
          <Input
            type="number"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="h-7 text-xs font-mono w-24"
            min={min}
            autoFocus
          />
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSave} disabled={saving}>
          <Check className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCancel} disabled={saving}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  const display = formatDisplay ? formatDisplay(value ?? null) : (value?.toString() ?? nullLabel);

  return (
    <div className="flex items-center gap-1.5 group/num">
      <span className="text-sm font-mono text-foreground">{display}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover/num:opacity-100 transition-opacity"
        onClick={handleEdit}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    </div>
  );
}

// ---------- add-on types + hook ----------

interface AddOn {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string;
  priceCents: number | null;
  billingInterval: string;
  featureKey: string;
  usageLimits: Record<string, number> | null;
  usageLimitUnit: string | null;
  overageRateCents: number | null;
  providerPriceId: string | null;
  isActive: boolean;
  displayOrder: number;
}

function useAddOnsCatalog() {
  return useQuery<AddOn[]>({
    queryKey: ['admin', 'add-ons-catalog'],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await apiClient<any>('/admin/add-ons');
      return Array.isArray(data) ? data : data.addOns || [];
    },
    ...QUERY_TIERS.STATIC,
  });
}

// ---------- skeleton ----------

function PlansPageSkeleton() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 mt-2" />
      </div>

      {/* Stats skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6 text-center">
              <Skeleton className="h-9 w-12 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto mt-1" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Cards skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48 mt-1" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-4 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ---------- plan detail sheet ----------

interface PlanDetailSheetProps {
  plan: (PlanConfig & { entitlements: PlanEntitlement[] }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function PlanDetailSheet({ plan, open, onOpenChange }: PlanDetailSheetProps) {
  const queryClient = useQueryClient();
  const [togglingFeature, setTogglingFeature] = useState<string | null>(null);

  if (!plan) return null;

  const enabledCount = plan.entitlements.filter((e) => e.enabled).length;

  const savePlanField = async (field: string, value: unknown) => {
    try {
      await plansApi.updatePlanConfig(plan.plan, { [field]: value });
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      showSuccess(`${field} updated`);
    } catch (err) {
      showError(`Failed to update ${field}`, extractErrorMessage(err));
      throw err;
    }
  };

  const handleToggleEntitlement = async (feature: string, enabled: boolean) => {
    setTogglingFeature(feature);
    try {
      await plansApi.toggleEntitlement(plan.plan, feature, enabled);
      queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
      showSuccess(`Entitlement ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      showError('Failed to toggle entitlement', extractErrorMessage(err));
    } finally {
      setTogglingFeature(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto" pinnable resizable>
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-muted-foreground" />
            {plan.displayName}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Plan Overview */}
          <div className="space-y-4">
            {/* Display Name */}
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Display Name</Label>
              <div className="mt-1">
                <InlineEditor
                  value={plan.displayName}
                  onSave={(v) => savePlanField('displayName', v)}
                  placeholder="Plan name..."
                />
              </div>
            </div>

            {/* Tagline */}
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Tagline</Label>
              <div className="mt-1">
                <InlineEditor
                  value={plan.tagline}
                  onSave={(v) => savePlanField('tagline', v)}
                  placeholder="Plan tagline..."
                />
              </div>
            </div>

            {/* Price */}
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Price (cents)</Label>
              <div className="mt-1">
                <InlineNumberEditor
                  value={plan.pricePerUnit}
                  onSave={(v) => savePlanField('pricePerUnit', v)}
                  formatDisplay={(v) => {
                    if (v === null) return 'Custom';
                    if (v === 0) return 'Free ($0)';
                    return `${formatPrice(v)} (${v}c)`;
                  }}
                  allowNull
                  nullLabel="Custom"
                  min={0}
                  placeholder="0"
                />
              </div>
            </div>

            {/* Fleet & User Limits */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Fleet Limit</Label>
                <div className="mt-1">
                  <InlineNumberEditor
                    value={plan.fleetLimit}
                    onSave={(v) => savePlanField('fleetLimit', v)}
                    formatDisplay={formatLimit}
                    allowNull
                    nullLabel="Unlimited"
                    min={1}
                    placeholder="e.g. 50"
                  />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">User Limit</Label>
                <div className="mt-1">
                  <InlineNumberEditor
                    value={plan.userLimit}
                    onSave={(v) => savePlanField('userLimit', v)}
                    formatDisplay={formatLimit}
                    allowNull
                    nullLabel="Unlimited"
                    min={1}
                    placeholder="e.g. 10"
                  />
                </div>
              </div>
            </div>

            {/* Plan Key & Display Order (read-only) */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Plan Key</Label>
                <p className="text-sm font-mono text-foreground mt-1">{plan.plan}</p>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Display Order</Label>
                <p className="text-sm font-mono text-foreground mt-1">{plan.displayOrder}</p>
              </div>
            </div>

            {/* CTA Label & Popular */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">CTA Label</Label>
                <div className="mt-1">
                  <InlineEditor
                    value={plan.ctaLabel}
                    onSave={(v) => savePlanField('ctaLabel', v)}
                    placeholder="e.g. Get Started"
                  />
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Popular</Label>
                <div className="mt-2">
                  <Switch
                    checked={plan.isPopular}
                    onCheckedChange={async (checked) => {
                      try {
                        await plansApi.updatePlanConfig(plan.plan, {
                          isPopular: checked,
                        });
                        queryClient.invalidateQueries({
                          queryKey: ['admin', 'plans'],
                        });
                        showSuccess(checked ? 'Marked as popular' : 'Removed popular badge');
                      } catch (err) {
                        showError('Failed to update', extractErrorMessage(err));
                      }
                    }}
                    aria-label="Mark plan as popular"
                  />
                </div>
              </div>
            </div>

            {/* Provider Price ID */}
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wider">Provider Price ID</Label>
              <div className="mt-1">
                <InlineEditor
                  value={plan.providerPriceId}
                  onSave={(v) => savePlanField('providerPriceId', v)}
                  placeholder="price_..."
                  mono
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Entitlements */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Entitlements</h3>
              <Badge variant="outline" className="text-xs">
                {enabledCount}/{plan.entitlements.length} enabled
              </Badge>
            </div>

            {plan.entitlements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entitlements configured for this plan.</p>
            ) : (
              <div className="space-y-3">
                {plan.entitlements.map((entitlement) => (
                  <div key={entitlement.feature} className="flex items-center justify-between gap-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{entitlement.displayName}</p>
                      <p className="text-xs font-mono text-muted-foreground">{entitlement.feature}</p>
                    </div>
                    <Switch
                      checked={entitlement.enabled}
                      disabled={togglingFeature === entitlement.feature}
                      onCheckedChange={(checked) => handleToggleEntitlement(entitlement.feature, checked)}
                      aria-label={`${entitlement.displayName} entitlement`}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------- add-on catalog tab ----------

function AddOnCatalogTab() {
  const queryClient = useQueryClient();
  const { data: addOns, isLoading } = useAddOnsCatalog();
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  const handleToggleActive = useCallback(
    async (addon: AddOn, checked: boolean) => {
      setTogglingSlug(addon.slug);
      try {
        await adminAddOnsApi.updateAddOn(addon.slug, { isActive: checked });
        queryClient.invalidateQueries({ queryKey: ['admin', 'add-ons-catalog'] });
        showSuccess(checked ? 'Add-on activated' : 'Add-on deactivated');
      } catch (err) {
        showError('Failed to update status', extractErrorMessage(err));
      } finally {
        setTogglingSlug(null);
      }
    },
    [queryClient],
  );

  if (isLoading) {
    return (
      <div className="space-y-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  const catalog = addOns ?? [];

  if (catalog.length === 0) {
    return (
      <Card className="mt-6">
        <CardContent className="py-12 text-center">
          <Puzzle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-lg font-semibold text-foreground">No add-ons configured</p>
          <p className="text-sm text-muted-foreground mt-1">
            Add-ons will appear here once they are seeded in the database.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group by category
  const grouped = catalog.reduce<Record<string, AddOn[]>>((acc, addon) => {
    const cat = addon.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(addon);
    return acc;
  }, {});

  return (
    <div className="space-y-6 mt-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-mono text-foreground">{catalog.length}</p>
            <p className="text-sm text-muted-foreground">Total Add-ons</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-mono text-foreground">{Object.keys(grouped).length}</p>
            <p className="text-sm text-muted-foreground">Categories</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-3xl font-bold font-mono text-foreground">
              {catalog.filter((a) => a.priceCents !== null && a.priceCents > 0).length}
            </p>
            <p className="text-sm text-muted-foreground">Paid Add-ons</p>
          </CardContent>
        </Card>
      </div>

      {/* Grouped tables */}
      {Object.entries(grouped).map(([category, items]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="capitalize">{category}</CardTitle>
            <CardDescription>
              {items.length} add-on{items.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden sm:table-cell">Feature Key</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead className="hidden md:table-cell">Usage Limit</TableHead>
                  <TableHead className="hidden lg:table-cell">Provider Price ID</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((addon) => (
                  <TableRow key={addon.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{addon.name}</p>
                        {addon.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1">{addon.description}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <code className="text-xs font-mono text-muted-foreground">{addon.featureKey}</code>
                    </TableCell>
                    <TableCell>
                      <InlineNumberEditor
                        value={addon.priceCents}
                        onSave={async (v) => {
                          try {
                            await adminAddOnsApi.updateAddOn(addon.slug, { priceCents: v });
                            queryClient.invalidateQueries({ queryKey: ['admin', 'add-ons-catalog'] });
                            showSuccess('Price updated');
                          } catch (err) {
                            showError('Failed to update price', extractErrorMessage(err));
                            throw err;
                          }
                        }}
                        formatDisplay={(v) => {
                          const label = formatPrice(v);
                          if (v !== null && v !== undefined && v > 0) {
                            return `${label}/${addon.billingInterval}`;
                          }
                          return label;
                        }}
                        allowNull
                        nullLabel="Custom"
                        min={0}
                        placeholder="0"
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {addon.usageLimits ? (
                        <span className="text-xs font-mono text-muted-foreground">
                          {Object.entries(addon.usageLimits)
                            .map(([k, v]) => `${v} ${k}`)
                            .join(', ')}
                          {addon.usageLimitUnit && ` ${addon.usageLimitUnit}`}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlimited</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <InlineEditor
                        value={addon.providerPriceId}
                        onSave={async (priceId) => {
                          try {
                            await adminAddOnsApi.updateAddOnProviderPrice(addon.slug, priceId);
                            queryClient.invalidateQueries({ queryKey: ['admin', 'add-ons-catalog'] });
                            showSuccess('Price ID updated');
                          } catch (err) {
                            showError('Failed to update price ID', extractErrorMessage(err));
                            throw err;
                          }
                        }}
                        placeholder="price_..."
                        mono
                      />
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={addon.isActive}
                        disabled={togglingSlug === addon.slug}
                        onCheckedChange={(checked) => handleToggleActive(addon, checked)}
                        aria-label={`${addon.name} active status`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- main page ----------

export default function PlansAdminPage() {
  const queryClient = useQueryClient();
  const { data: plans, isLoading } = usePlansAdmin();
  const [selectedPlan, setSelectedPlan] = useState<(PlanConfig & { entitlements: PlanEntitlement[] }) | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keep selectedPlan in sync with query data so inline edits reflect immediately
  const livePlan = useMemo(() => {
    if (!selectedPlan || !plans) return selectedPlan;
    return plans.find((p) => p.plan === selectedPlan.plan) ?? selectedPlan;
  }, [selectedPlan, plans]);

  const stats = useMemo(() => {
    if (!plans) return { total: 0, withLimits: 0, totalEntitlements: 0 };
    return {
      total: plans.length,
      withLimits: plans.filter((p) => p.fleetLimit !== null).length,
      totalEntitlements: plans.reduce((sum, p) => sum + (p.entitlements?.length ?? 0), 0),
    };
  }, [plans]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
          <Crown className="h-8 w-8" />
          Plans & Entitlements
        </h1>
        <p className="text-muted-foreground mt-1">Platform pricing tiers, feature entitlements, and add-on catalog.</p>
      </div>

      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="add-ons">Add-on Catalog</TabsTrigger>
          <TabsTrigger value="requests">Requests</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-8 mt-6">
          {isLoading ? (
            <PlansPageSkeleton />
          ) : (
            <>
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold font-mono text-foreground">{stats.total}</p>
                    <p className="text-sm text-muted-foreground">Active Plans</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold font-mono text-foreground">{stats.withLimits}</p>
                    <p className="text-sm text-muted-foreground">With Fleet Limits</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-3xl font-bold font-mono text-foreground">{stats.totalEntitlements}</p>
                    <p className="text-sm text-muted-foreground">Total Entitlements</p>
                  </CardContent>
                </Card>
              </div>

              {/* Plan Cards Grid */}
              {(plans ?? []).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Crown className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-lg font-semibold text-foreground">No plans configured</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Plan configurations will appear here once they are seeded in the database.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(plans ?? []).map((plan) => {
                    const entitlements = plan.entitlements ?? [];
                    const enabledCount = entitlements.filter((e: PlanEntitlement) => e.enabled).length;

                    return (
                      <Card
                        key={plan.id}
                        className="cursor-pointer transition-colors hover:border-foreground/20"
                        onClick={() => {
                          setSelectedPlan(plan);
                          setSheetOpen(true);
                        }}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-lg">{plan.displayName}</CardTitle>
                            {plan.isPopular && (
                              <Badge variant="default" className="text-xs">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Popular
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div>
                            <p className="text-2xl font-bold font-mono text-foreground">
                              {formatPrice(plan.pricePerUnit)}
                            </p>
                            {plan.pricePerUnit !== null && plan.pricePerUnit > 0 && (
                              <p className="text-xs text-muted-foreground">per {plan.unitLabel}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <Truck className="h-4 w-4" />
                              <span className="font-mono">{formatLimit(plan.fleetLimit)}</span>
                              <span>trucks</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Users className="h-4 w-4" />
                              <span className="font-mono">{formatLimit(plan.userLimit)}</span>
                              <span>users</span>
                            </div>
                          </div>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              {enabledCount}/{entitlements.length} entitlements enabled
                            </p>
                            <Badge variant="outline" className="text-xs font-mono">
                              {plan.plan}
                            </Badge>
                          </div>
                          <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                            <p className="text-xs text-muted-foreground mb-1">Stripe Price ID</p>
                            <InlineEditor
                              value={plan.providerPriceId}
                              onSave={async (priceId) => {
                                try {
                                  await plansApi.updatePlanProviderPrice(plan.plan, priceId);
                                  queryClient.invalidateQueries({ queryKey: ['admin', 'plans'] });
                                  showSuccess('Price ID updated');
                                } catch (err) {
                                  showError('Failed to update price ID', extractErrorMessage(err));
                                  throw err;
                                }
                              }}
                              placeholder="price_..."
                              mono
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="add-ons">
          <AddOnCatalogTab />
        </TabsContent>

        <TabsContent value="requests">
          <AddOnRequestsTab />
        </TabsContent>
      </Tabs>

      {/* Detail Sheet */}
      <PlanDetailSheet
        plan={livePlan ?? null}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSelectedPlan(null);
        }}
      />
    </div>
  );
}
