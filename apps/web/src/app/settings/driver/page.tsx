'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@sally/ui/components/ui/card';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@sally/ui/components/ui/select';
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
import type { DriverPreferences } from '@/features/platform/settings';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Save, RotateCcw } from 'lucide-react';

export default function DriverRouteDisplayPage() {
  const { user } = useAuthStore();
  const { driverPreferences, updateDriverPrefs, resetToDefaults, loadAllPreferences, isSaving, isLoading } =
    usePreferencesStore();
  const [formData, setFormData] = useState<Partial<DriverPreferences>>(driverPreferences || {});
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  useEffect(() => {
    if (user) {
      loadAllPreferences(user.role);
    }
  }, [user, loadAllPreferences]);

  useEffect(() => {
    if (driverPreferences) setFormData(driverPreferences);
  }, [driverPreferences]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await updateDriverPrefs(formData);
    } catch {
      // toast shown by store
    }
  };

  const handleReset = async () => {
    setResetConfirmOpen(false);
    try {
      await resetToDefaults('driver');
      const resetPrefs = usePreferencesStore.getState().driverPreferences;
      if (resetPrefs) setFormData(resetPrefs);
    } catch {
      // toast shown by store
    }
  };

  if (isLoading || !driverPreferences) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64 mt-1" />
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
      <div>
        <h2 className="text-xl font-semibold text-foreground">Driver Preferences</h2>
        <p className="text-sm text-muted-foreground">Customize how routes appear and how Sally reaches you.</p>
      </div>

      {/* Display & Navigation */}
      <Card>
        <CardHeader>
          <CardTitle>Display & Navigation</CardTitle>
          <CardDescription>Adjust display settings and navigation app preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Theme</Label>
              <p className="text-xs text-muted-foreground">Choose your preferred app theme for the driver view.</p>
            </div>
            <Select value={formData.theme || 'auto'} onValueChange={(v) => handleChange('theme', v)}>
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (System)</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <Label>Preferred Navigation App</Label>
              <p className="text-xs text-muted-foreground">
                Which app opens when you tap &ldquo;Navigate&rdquo; on a stop.
              </p>
            </div>
            <Select
              value={formData.preferredNavApp || 'google_maps'}
              onValueChange={(v) => handleChange('preferredNavApp', v)}
            >
              <SelectTrigger className="w-full md:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google_maps">Google Maps</SelectItem>
                <SelectItem value="apple_maps">Apple Maps</SelectItem>
                <SelectItem value="waze">Waze</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>How you receive updates from Sally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Push Notifications</Label>
              <p className="text-xs text-muted-foreground">
                Receive push notifications for load updates, alerts, and messages.
              </p>
            </div>
            <Switch checked={formData.pushEnabled || false} onCheckedChange={(c) => handleChange('pushEnabled', c)} />
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
              Reset route display settings to defaults? This will overwrite your current preferences.
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
