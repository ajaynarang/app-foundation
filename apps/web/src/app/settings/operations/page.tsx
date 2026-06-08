'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@app/ui/components/ui/card';
import { Label } from '@app/ui/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@app/ui/components/ui/select';
import { Input } from '@app/ui/components/ui/input';
import { Button } from '@app/ui/components/ui/button';
import { Switch } from '@app/ui/components/ui/switch';
import { Badge } from '@app/ui/components/ui/badge';
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
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Save, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/features/auth';
import { useOperationsSettings, useUpdateOperationsSettings, useResetPreferences } from '@/features/platform/settings';
import type { OperationsSettings } from '@/features/platform/settings';

export default function OperationsSettingsPage() {
  const { user } = useAuthStore();
  const { data: operationsSettings, isLoading } = useOperationsSettings();
  const updateMutation = useUpdateOperationsSettings();
  const resetMutation = useResetPreferences();
  const [formData, setFormData] = useState<Partial<OperationsSettings>>({});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const canEdit = user?.role === 'ADMIN' || user?.role === 'OWNER';

  useEffect(() => {
    if (operationsSettings) setFormData(operationsSettings);
  }, [operationsSettings]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateMutation.mutate(formData);
  };

  const handleReset = () => {
    setResetConfirmOpen(false);
    resetMutation.mutate('operations');
  };

  if (isLoading || !operationsSettings) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-7 w-28" />
            <Skeleton className="h-4 w-96 mt-2" />
          </div>
          <Skeleton className="h-6 w-24" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-80 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-10 w-full md:w-48" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
        <div className="flex justify-between">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Dispatch Defaults</h2>
          <p className="text-sm text-muted-foreground">
            Company-wide routing defaults — dispatchers can override per route
          </p>
        </div>
        <Badge variant={canEdit ? 'default' : 'muted'}>{canEdit ? 'Admin / Owner' : 'Read Only'}</Badge>
      </div>

      {/* Optimization */}
      <Card>
        <CardHeader>
          <CardTitle>Optimization</CardTitle>
          <CardDescription>Control how Sally balances time and cost when planning routes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Cost Per Mile ($)</Label>
              <p className="text-xs text-muted-foreground">
                All-in cost including fuel, maintenance, and tires. Used for cost-optimized routes.
              </p>
            </div>
            <Input
              type="number"
              step="0.05"
              min="0"
              className="w-full md:w-48"
              value={formData.costPerMile ?? 1.85}
              onChange={(e) => handleChange('costPerMile', parseFloat(e.target.value))}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Labor Cost Per Hour ($)</Label>
              <p className="text-xs text-muted-foreground">
                Hourly driver cost including wages and benefits. Used for time vs cost trade-offs.
              </p>
            </div>
            <Input
              type="number"
              step="0.50"
              min="0"
              className="w-full md:w-48"
              value={formData.laborCostPerHour ?? 25.0}
              onChange={(e) => handleChange('laborCostPerHour', parseFloat(e.target.value))}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Rest Stops */}
      <Card>
        <CardHeader>
          <CardTitle>Rest Stops</CardTitle>
          <CardDescription>
            Configure how Sally inserts mandatory rest breaks into routes for HOS compliance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Prefer Full Rest</Label>
              <p className="text-xs text-muted-foreground">
                When a rest stop is needed, prefer 10-hour full rest over 7-hour partial rest.
              </p>
            </div>
            <Switch
              checked={formData.preferFullRest ?? true}
              onCheckedChange={(c) => handleChange('preferFullRest', c)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Dock Rest</Label>
              <p className="text-xs text-muted-foreground">
                Allow drivers to take their rest period at the destination dock if timing works.
              </p>
            </div>
            <Switch
              checked={formData.allowDockRest ?? true}
              onCheckedChange={(c) => handleChange('allowDockRest', c)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Split Sleeper Threshold (hours)</Label>
              <p className="text-xs text-muted-foreground">
                If remaining drive hours exceed this threshold, prefer split sleeper berth over full rest. Lower = more
                aggressive splitting.
              </p>
            </div>
            <Input
              type="number"
              min="8"
              max="30"
              className="w-full md:w-48"
              value={formData.splitSleeperThresholdHours ?? 16}
              onChange={(e) => handleChange('splitSleeperThresholdHours', parseInt(e.target.value))}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Fuel Stops */}
      <Card>
        <CardHeader>
          <CardTitle>Fuel Stops</CardTitle>
          <CardDescription>Set thresholds for when Sally suggests fuel detours along a route.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Max Fuel Detour (miles)</Label>
              <p className="text-xs text-muted-foreground">
                Furthest Sally will detour from the route to reach a cheaper fuel stop.
              </p>
            </div>
            <Input
              type="number"
              min="0"
              max="50"
              className="w-full md:w-48"
              value={formData.maxFuelDetour ?? 10}
              onChange={(e) => handleChange('maxFuelDetour', parseInt(e.target.value))}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Estimated Diesel Price ($/gal)</Label>
              <p className="text-xs text-muted-foreground">
                Default diesel price for route cost estimates. Dispatchers can override per-route. Shown as approximate
                (~) in the UI.
              </p>
            </div>
            <Input
              type="number"
              step="0.01"
              min="1.00"
              max="10.00"
              className="w-full md:w-48"
              value={formData.estimatedDieselPricePerGallon ?? 3.89}
              onChange={(e) => handleChange('estimatedDieselPricePerGallon', parseFloat(e.target.value))}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Shield / Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Shield / Compliance</CardTitle>
          <CardDescription>
            Control AI-powered compliance analysis and custom rule evaluation during Shield audits.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>AI Analysis</Label>
              <p className="text-xs text-muted-foreground">
                Enable AI-powered compliance analysis using FMCSA regulations. AI findings supplement rule-based checks.
              </p>
            </div>
            <Switch
              checked={formData.shieldAiEnabled ?? true}
              onCheckedChange={(c) => handleChange('shieldAiEnabled', c)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Custom Rules</Label>
              <p className="text-xs text-muted-foreground">
                Enable evaluation of organization-defined custom compliance rules during audits.
              </p>
            </div>
            <Switch
              checked={formData.shieldCustomRulesEnabled ?? true}
              onCheckedChange={(c) => handleChange('shieldCustomRulesEnabled', c)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Alert Resolve Cooldown (hours)</Label>
              <p className="text-xs text-muted-foreground">
                Minimum hours before a resolved alert of the same type can re-trigger. Range: 1-48.
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="48"
              className="w-full md:w-48"
              value={formData.alertResolveCooldownHours ?? 4}
              onChange={(e) => handleChange('alertResolveCooldownHours', parseInt(e.target.value))}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Document Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Document Compliance</CardTitle>
          <CardDescription>
            Set enforcement levels for required documents. These affect billing readiness checks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(
            [
              {
                field: 'bolEnforcement',
                label: 'Bill of Lading (BOL)',
                description: 'Required on pickup to confirm cargo details and quantities.',
              },
              {
                field: 'podEnforcement',
                label: 'Proof of Delivery (POD)',
                description: 'Required on delivery to confirm cargo was received.',
              },
              {
                field: 'rateConEnforcement',
                label: 'Rate Confirmation',
                description: 'Agreed rate document between carrier and broker/shipper.',
              },
              {
                field: 'lumperReceiptEnforcement',
                label: 'Lumper Receipt',
                description: 'Receipt for third-party loading/unloading services.',
              },
              {
                field: 'scaleTicketEnforcement',
                label: 'Scale Ticket',
                description: 'Weight verification ticket from a certified scale.',
              },
            ] as const
          ).map(({ field, label, description }) => (
            <div key={field} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <Label>{label}</Label>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Select
                value={formData[field] || 'required'}
                onValueChange={(v) => handleChange(field, v)}
                disabled={!canEdit}
              >
                <SelectTrigger className="w-full md:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="required">Required</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                  <SelectItem value="when_applicable">When Applicable</SelectItem>
                  <SelectItem value="not_required">Not Required</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>POD Grace Period (hours)</Label>
              <p className="text-xs text-muted-foreground">
                Time after delivery before a missing POD is flagged as overdue. Range: 1-168.
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="168"
              className="w-full md:w-48"
              value={formData.podGracePeriodHours ?? 48}
              onChange={(e) => handleChange('podGracePeriodHours', parseInt(e.target.value))}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Billing Requirements */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Requirements</CardTitle>
          <CardDescription>Control what is required before a load can be approved for billing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Require Billable Charge</Label>
              <p className="text-xs text-muted-foreground">
                Loads must have at least one billable charge before they can be approved for billing.
              </p>
            </div>
            <Switch
              checked={formData.requireBillableCharge ?? true}
              onCheckedChange={(c) => handleChange('requireBillableCharge', c)}
              disabled={!canEdit}
            />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Allow Billing Override</Label>
              <p className="text-xs text-muted-foreground">
                Allow dispatchers to override missing billing requirements with a reason. Creates an audit trail.
              </p>
            </div>
            <Switch
              checked={formData.allowBillingOverride ?? false}
              onCheckedChange={(c) => handleChange('allowBillingOverride', c)}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lane Generation */}
      <Card>
        <CardHeader>
          <CardTitle>Lane Generation</CardTitle>
          <CardDescription>Control how far ahead upcoming lane generations are shown to dispatchers.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Lookahead Window (days)</Label>
              <p className="text-xs text-muted-foreground">
                How many days ahead to show upcoming lane generations on the fleet page. Range: 1-14.
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="14"
              className="w-full md:w-48"
              value={formData.laneGenerationLookaheadDays ?? 3}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) handleChange('laneGenerationLookaheadDays', v);
              }}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      {canEdit && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setResetConfirmOpen(true)} disabled={updateMutation.isPending}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button loading={updateMutation.isPending} onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Defaults</AlertDialogTitle>
            <AlertDialogDescription>
              Reset operations settings to defaults? This will overwrite your current settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
