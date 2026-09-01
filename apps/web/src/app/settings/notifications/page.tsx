'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@app/ui/components/ui/card';
import { Label } from '@app/ui/components/ui/label';
import { Input } from '@app/ui/components/ui/input';
import { Button } from '@app/ui/components/ui/button';
import { Switch } from '@app/ui/components/ui/switch';
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
import { usePreferencesStore } from '@/features/platform/settings';
import type { UserPreferences } from '@/features/platform/settings';
import { useNotificationPreferenceOptions } from '@/features/notifications/hooks/use-notification-preference-options';
import type { NotificationChannelRule, NotificationPreferenceChannel } from '@app/shared-types';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Save, RotateCcw } from 'lucide-react';

/** Copy per category. Which categories appear, and which channels, comes from the server's policy. */
const CATEGORY_COPY: Record<string, { label: string; description: string }> = {
  system: { label: 'System', description: 'Integrations, sync, shield audits' },
  team: { label: 'Team', description: 'Invitations, role changes, activations' },
  billing: { label: 'Billing', description: 'Invoices, payments, settlements' },
};

const CHANNEL_LABELS: Record<NotificationPreferenceChannel, string> = {
  inApp: 'In-App',
  push: 'Push',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
};

const CHANNEL_ORDER: NotificationPreferenceChannel[] = ['inApp', 'push', 'email', 'sms', 'whatsapp'];

const titleCase = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

export default function NotificationsSettingsPage() {
  const { user } = useAuthStore();
  const { userPreferences, updateUserPrefs, resetToDefaults, loadAllPreferences, isSaving, isLoading } =
    usePreferencesStore();
  const {
    data: options,
    isLoading: isLoadingOptions,
    isError: optionsFailed,
    refetch: refetchOptions,
  } = useNotificationPreferenceOptions();
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
  const ruleFor = (category: string, channel: string): NotificationChannelRule | undefined =>
    options?.categories.find((c) => c.key === category)?.channels[channel as NotificationPreferenceChannel];
  const channelsOf = (category: string): NotificationPreferenceChannel[] =>
    CHANNEL_ORDER.filter((channel) => ruleFor(category, channel) !== undefined);
  const getCategoryChannel = (category: string, channel: string): boolean => {
    const channels = (formData as Record<string, unknown>).notificationPreferences as
      | Record<string, Record<string, boolean>>
      | undefined;
    const rule = ruleFor(category, channel);
    // The server says what this channel does for this user with no stored choice; `always` cannot be turned off.
    if (rule === 'always') return true;
    return (
      channels?.[category]?.[channel] ??
      options?.categories.find((c) => c.key === category)?.defaults[channel as NotificationPreferenceChannel] ??
      false
    );
  };

  const setCategoryChannel = (category: string, channel: string, value: boolean) => {
    const current =
      ((formData as Record<string, unknown>).notificationPreferences as Record<string, Record<string, boolean>>) || {};
    const categoryChannels = current[category] || {};
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

  if (isLoading || isLoadingOptions || !userPreferences) {
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
        <p className="text-sm text-muted-foreground">How and when the Assistant gets your attention</p>
      </div>

      {/* Notification Channels — table grid like alerts page */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Channels</CardTitle>
          <CardDescription>Choose which channels to use for each notification category.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Header row — a column header only means anything when the switches below it line up in a
              column, which they do not on a phone. The narrow layout names each channel on the switch
              itself instead. */}
          {/* Rows: each category offers only the channels its policy allows. Below md the switches sit
              on a row of their own under the category, each carrying its own label. */}
          {optionsFailed && (
            <div className="flex items-center justify-between gap-4 py-3">
              <p className="text-sm text-muted-foreground">Couldn&apos;t load which channels you can choose from.</p>
              <Button variant="outline" size="sm" onClick={() => void refetchOptions()}>
                Try again
              </Button>
            </div>
          )}
          {(options?.categories ?? []).map((cat) => {
            const copy = CATEGORY_COPY[cat.key] ?? { label: titleCase(cat.key), description: '' };
            return (
              <div key={cat.key} className="py-3 border-b border-border last:border-0">
                <div className="text-sm font-medium text-foreground">{copy.label}</div>
                {copy.description && <div className="text-xs text-muted-foreground">{copy.description}</div>}
                <div className="mt-3 flex flex-wrap items-start gap-x-6 gap-y-3">
                  {channelsOf(cat.key).map((ch) => {
                    const rule = ruleFor(cat.key, ch);
                    return (
                      <div key={ch} className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Switch
                            id={`${cat.key}-${ch}`}
                            checked={getCategoryChannel(cat.key, ch)}
                            disabled={rule === 'always'}
                            onCheckedChange={(checked) => setCategoryChannel(cat.key, ch, checked)}
                          />
                          <Label htmlFor={`${cat.key}-${ch}`} className="text-xs text-muted-foreground">
                            {CHANNEL_LABELS[ch]}
                          </Label>
                        </div>
                        {rule === 'fallback' && (
                          <span className="text-[11px] text-muted-foreground">Only if push can&apos;t reach you</span>
                        )}
                        {rule === 'always' && <span className="text-[11px] text-muted-foreground">Always on</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
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
          Reset to defaults
        </Button>
        <Button loading={isSaving} onClick={handleSave}>
          <Save className="h-4 w-4 mr-2" />
          Save changes
        </Button>
      </div>

      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults</AlertDialogTitle>
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
