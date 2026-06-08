'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@sally/ui/components/ui/card';
import { Label } from '@sally/ui/components/ui/label';
import { Input } from '@sally/ui/components/ui/input';
import { Button } from '@sally/ui/components/ui/button';
import { Switch } from '@sally/ui/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { useAuthStore } from '@/features/auth';
import { usePreferencesStore } from '@/features/platform/settings';
import type { UserPreferences } from '@/features/platform/settings';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Save, RotateCcw } from 'lucide-react';

const CATEGORIES = [
  { key: 'system', label: 'System', description: 'Integrations, sync, shield audits' },
  { key: 'team', label: 'Team', description: 'Invitations, role changes, activations' },
  { key: 'billing', label: 'Billing', description: 'Invoices, payments, settlements' },
] as const;

const CHANNELS = [
  { key: 'inApp', label: 'In-App' },
  { key: 'email', label: 'Email' },
  { key: 'sms', label: 'SMS' },
] as const;

const DEFAULT_CATEGORY_CHANNELS: Record<string, Record<string, boolean>> = {
  system: { inApp: true, email: true, sms: false },
  team: { inApp: true, email: true, sms: false },
  billing: { inApp: true, email: true, sms: true },
};

export default function NotificationsSettingsPage() {
  const { user } = useAuthStore();
  const { userPreferences, updateUserPrefs, resetToDefaults, loadAllPreferences, isSaving, isLoading } =
    usePreferencesStore();
  const [formData, setFormData] = useState<Partial<UserPreferences>>(userPreferences || {});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadAllPreferences(user.role);
    }
  }, [user, loadAllPreferences]);

  useEffect(() => {
    if (userPreferences) setFormData(userPreferences);
  }, [userPreferences]);

  const handleChange = (field: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Category channel helpers
  const getCategoryChannel = (category: string, channel: string): boolean => {
    const channels = (formData as Record<string, unknown>).notificationPreferences as
      | Record<string, Record<string, boolean>>
      | undefined;
    return channels?.[category]?.[channel] ?? DEFAULT_CATEGORY_CHANNELS[category]?.[channel] ?? false;
  };

  const setCategoryChannel = (category: string, channel: string, value: boolean) => {
    const current =
      ((formData as Record<string, unknown>).notificationPreferences as Record<string, Record<string, boolean>>) || {};
    const categoryChannels = current[category] || { ...DEFAULT_CATEGORY_CHANNELS[category] };
    const updated = {
      ...current,
      [category]: { ...categoryChannels, [channel]: value },
    };
    setFormData((prev) => ({
      ...prev,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      notificationPreferences: updated as any,
    }));
  };

  const handleSave = async () => {
    try {
      await updateUserPrefs(formData);
    } catch {
      // toast shown by store
    }
  };

  const handleReset = async () => {
    setResetConfirmOpen(false);
    try {
      await resetToDefaults('user');
      const resetPrefs = usePreferencesStore.getState().userPreferences;
      if (resetPrefs) setFormData(resetPrefs);
    } catch {
      // toast shown by store
    }
  };

  if (isLoading || !userPreferences) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-80 mt-2" />
        </div>
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-64 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-36" />
                    <Skeleton className="h-3 w-72" />
                  </div>
                  <Skeleton className="h-5 w-10" />
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
      <div>
        <h2 className="text-xl font-semibold text-foreground">Notifications</h2>
        <p className="text-sm text-muted-foreground">How and when SALLY gets your attention</p>
      </div>

      {/* Notification Channels — table grid like alerts page */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Channels</CardTitle>
          <CardDescription>Choose which channels to use for each notification category.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Header row */}
          <div className="grid grid-cols-4 gap-4 mb-3 pb-2 border-b border-border">
            <div className="text-sm font-medium text-muted-foreground">Category</div>
            {CHANNELS.map((ch) => (
              <div key={ch.key} className="text-sm font-medium text-muted-foreground text-center">
                {ch.label}
              </div>
            ))}
          </div>
          {/* Rows */}
          {CATEGORIES.map((cat) => (
            <div
              key={cat.key}
              className="grid grid-cols-4 gap-4 py-3 border-b border-border last:border-0 items-center"
            >
              <div>
                <div className="text-sm font-medium text-foreground">{cat.label}</div>
                <div className="text-xs text-muted-foreground">{cat.description}</div>
              </div>
              {CHANNELS.map((ch) => (
                <div key={ch.key} className="flex justify-center">
                  <Switch
                    checked={getCategoryChannel(cat.key, ch.key)}
                    onCheckedChange={(checked) => setCategoryChannel(cat.key, ch.key, checked)}
                  />
                </div>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quiet Hours */}
      <Card>
        <CardHeader>
          <CardTitle>Quiet Hours</CardTitle>
          <CardDescription>Suppress push notifications and sounds during quiet hours.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Enable Quiet Hours</Label>
              <p className="text-xs text-muted-foreground">
                When enabled, non-urgent notifications are muted between the start and end times.
              </p>
            </div>
            <Switch
              checked={formData.quietHoursEnabled || false}
              onCheckedChange={(checked) => handleChange('quietHoursEnabled', checked)}
            />
          </div>

          {formData.quietHoursEnabled && (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label>Start Time</Label>
                  <p className="text-xs text-muted-foreground">When quiet hours begin each day.</p>
                </div>
                <Input
                  type="time"
                  className="w-full md:w-48"
                  value={formData.quietHoursStart || '22:00'}
                  onChange={(e) => handleChange('quietHoursStart', e.target.value)}
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Label>End Time</Label>
                  <p className="text-xs text-muted-foreground">When quiet hours end each day.</p>
                </div>
                <Input
                  type="time"
                  className="w-full md:w-48"
                  value={formData.quietHoursEnd || '06:00'}
                  onChange={(e) => handleChange('quietHoursEnd', e.target.value)}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
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

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Defaults</AlertDialogTitle>
            <AlertDialogDescription>
              Reset notification settings to defaults? This will overwrite your current preferences.
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
