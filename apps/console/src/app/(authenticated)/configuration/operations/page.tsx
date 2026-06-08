'use client';

import { useEffect, useState } from 'react';
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
import { useAuthStore } from '@/features/auth';
import { usePreferencesStore } from '@/features/settings';
import type { OperationsSettings } from '@/features/settings';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Checkbox } from '@app/ui/components/ui/checkbox';
import { Save, RotateCcw } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { getActiveFuelCardTypes, type FuelCardType } from '@/features/fuel-cards/api';
import { getComplianceDocumentTypes } from '@app/shared-types';

export default function OperationsSettingsPage() {
  const { user } = useAuthStore();
  const { operationsSettings, updateOperationsSettings, resetToDefaults, loadAllPreferences, isSaving, isLoading } =
    usePreferencesStore();
  const [formData, setFormData] = useState<Partial<OperationsSettings>>(operationsSettings || {});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const canEdit = user?.role === 'ADMIN' || user?.role === 'OWNER';

  const { data: fuelCardTypes } = useQuery({
    queryKey: ['fuel-card-types'],
    queryFn: getActiveFuelCardTypes,
  });

  const toggleFuelCard = (cardId: string) => {
    const current = (formData.fuelCards as string[] | undefined) ?? [];
    const updated = current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId];
    handleChange('fuelCards', updated);
  };

  useEffect(() => {
    if (user) {
      loadAllPreferences(user.role);
    }
  }, [user, loadAllPreferences]);

  useEffect(() => {
    if (operationsSettings) setFormData(operationsSettings);
  }, [operationsSettings]);

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await updateOperationsSettings(formData);
    } catch {
      // toast shown by store
    }
  };

  const handleReset = async () => {
    setResetConfirmOpen(false);
    try {
      await resetToDefaults('operations');
      const resetSettings = usePreferencesStore.getState().operationsSettings;
      if (resetSettings) setFormData(resetSettings);
    } catch {
      // toast shown by store
    }
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
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
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
          <h2 className="text-xl font-semibold text-foreground">Operations</h2>
          <p className="text-sm text-muted-foreground">
            Company-wide defaults for how Sally plans routes. These apply to all dispatchers unless overridden
            per-route.
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

          <div className="pt-2 border-t border-border">
            <Label>Fleet Fuel Cards</Label>
            <p className="text-xs text-muted-foreground mb-3">
              Select the fuel cards your fleet uses. SALLY will prioritize stations that accept your cards when planning
              routes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {fuelCardTypes?.map((card: FuelCardType) => (
                <label
                  key={card.id}
                  className="flex items-center gap-3 p-2.5 rounded-md border border-border hover:bg-accent/50 cursor-pointer"
                >
                  <Checkbox
                    checked={((formData.fuelCards as string[] | undefined) ?? []).includes(card.id)}
                    onCheckedChange={() => toggleFuelCard(card.id)}
                    disabled={!canEdit}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{card.displayName}</span>
                    {card.description && <p className="text-xs text-muted-foreground truncate">{card.description}</p>}
                  </div>
                </label>
              ))}
            </div>
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
              <Label>Audit Period (days)</Label>
              <p className="text-xs text-muted-foreground">
                How frequently Shield compliance audits run automatically. Range: 1–365 days.
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="365"
              className="w-full md:w-48"
              value={formData.shieldAuditPeriodDays ?? 30}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) handleChange('shieldAuditPeriodDays', v);
              }}
              disabled={!canEdit}
            />
          </div>
        </CardContent>
      </Card>

      {/* Alert Behavior */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Behavior</CardTitle>
          <CardDescription>Configure how long alerts remain suppressed after manual resolution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Resolve Cooldown (hours)</Label>
              <p className="text-xs text-muted-foreground">
                After a dispatcher manually resolves an alert, suppress the same alert type for this many hours.
                Prevents resolved alerts from immediately re-firing. Range: 1–48.
              </p>
            </div>
            <Input
              type="number"
              min="1"
              max="48"
              className="w-full md:w-48"
              value={formData.alertResolveCooldownHours ?? 4}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v)) handleChange('alertResolveCooldownHours', v);
              }}
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
                How many days ahead to show upcoming lane generations on the fleet page. Range: 1–14.
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

      {/* Document Compliance */}
      <Card>
        <CardHeader>
          <CardTitle>Document Compliance</CardTitle>
          <CardDescription>
            Configure which documents are required before a load can be approved for billing, and how missing items are
            handled.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {getComplianceDocumentTypes('load').map(([code, config]) => {
            if (!config.enforcementSettingsKey) return null;
            const settingsKey = config.enforcementSettingsKey as keyof typeof formData;
            return (
              <div key={code} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label>
                    {config.label}
                    {code === 'bol' ? ' (BOL)' : code === 'pod' ? ' (POD)' : ''}
                  </Label>
                  <p className="text-xs text-muted-foreground">{config.description}</p>
                </div>
                <Select
                  value={(formData[settingsKey] as string) || config.defaultEnforcement}
                  onValueChange={(v) => handleChange(settingsKey as string, v)}
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
            );
          })}

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>POD Grace Period (hours)</Label>
              <p className="text-xs text-muted-foreground">
                Hours after delivery before a missing POD is flagged as overdue. Range: 1–168.
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

          <div className="flex items-center justify-between">
            <div>
              <Label>Require Billable Charge</Label>
              <p className="text-xs text-muted-foreground">
                At least one billable charge must exist before approving for billing.
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
                Let dispatchers override missing requirements with an audit-logged reason.
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

      {/* Action Buttons */}
      {canEdit && (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => setResetConfirmOpen(true)} disabled={isSaving}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button loading={isSaving} onClick={handleSave}>
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
