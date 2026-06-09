'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@app/ui/components/ui/card';
import { Label } from '@app/ui/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@app/ui/components/ui/select';
import { Button } from '@app/ui/components/ui/button';
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
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Save, RotateCcw } from 'lucide-react';

export default function GeneralSettingsPage() {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-4 w-64 mt-2" />
        </div>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-72 mt-1" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-56" />
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
      <div>
        <h2 className="text-xl font-semibold text-foreground">General</h2>
        <p className="text-sm text-muted-foreground">Make the platform yours</p>
      </div>

      {/* Display Formats */}
      <Card>
        <CardHeader>
          <CardTitle>Display Formats</CardTitle>
          <CardDescription>Choose the date, time, and timezone formats used throughout the app.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Time Format</Label>
              <p className="text-xs text-muted-foreground">Applies to schedules and timestamps.</p>
            </div>
            <Select value={formData.timeFormat || '12H'} onValueChange={(v) => handleChange('timeFormat', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="12H">12-hour</SelectItem>
                <SelectItem value="24H">24-hour</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Timezone</Label>
              <p className="text-xs text-muted-foreground">
                All times in Assistant will be displayed in this timezone.
              </p>
            </div>
            <Select value={formData.timezone || 'America/New_York'} onValueChange={(v) => handleChange('timezone', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="America/New_York">Eastern</SelectItem>
                <SelectItem value="America/Chicago">Central</SelectItem>
                <SelectItem value="America/Denver">Mountain</SelectItem>
                <SelectItem value="America/Los_Angeles">Pacific</SelectItem>
                <SelectItem value="America/Anchorage">Alaska</SelectItem>
                <SelectItem value="America/Honolulu">Hawaii</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Date Format</Label>
              <p className="text-xs text-muted-foreground">How dates appear throughout Assistant.</p>
            </div>
            <Select value={formData.dateFormat || 'MM/DD/YYYY'} onValueChange={(v) => handleChange('dateFormat', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Assistant AI Voice */}
      <Card>
        <CardHeader>
          <CardTitle>Assistant AI Voice</CardTitle>
          <CardDescription>Configure how Assistant sounds when using voice mode.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Voice Mode</Label>
              <p className="text-xs text-muted-foreground">
                Manual requires pressing a button to talk. Auto activates voice when Assistant detects silence.
              </p>
            </div>
            <Select value={formData.voiceMode || 'manual'} onValueChange={(v) => handleChange('voiceMode', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="auto">Auto</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Voice</Label>
              <p className="text-xs text-muted-foreground">Choose the tone Assistant uses when speaking.</p>
            </div>
            <Select value={formData.voiceId || 'warm'} onValueChange={(v) => handleChange('voiceId', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warm">Warm</SelectItem>
                <SelectItem value="confident">Confident</SelectItem>
                <SelectItem value="calm">Calm</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Voice Speed</Label>
              <p className="text-xs text-muted-foreground">How fast Assistant speaks.</p>
            </div>
            <Select value={formData.voiceSpeed || 'normal'} onValueChange={(v) => handleChange('voiceSpeed', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="slowest">Slowest</SelectItem>
                <SelectItem value="slow">Slow</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="fast">Fast</SelectItem>
                <SelectItem value="fastest">Fastest</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
              Reset general settings to defaults? This will overwrite your current preferences.
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
