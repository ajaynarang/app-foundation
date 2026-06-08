'use client';

import { ChevronRight } from 'lucide-react';
import { Label } from '@sally/ui/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@sally/ui/components/ui/select';
import { Switch } from '@sally/ui/components/ui/switch';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { useDriverPreferences, type NavApp } from '../hooks/use-driver-preferences';
import { getAllNavApps } from '../lib/external-navigation';

interface DriverPreferencesProps {
  onChangePinTap?: () => void;
}

export function DriverPreferences({ onChangePinTap }: DriverPreferencesProps) {
  const { preferences, updatePreference } = useDriverPreferences();

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h4 className="text-sm font-semibold text-foreground">Preferences</h4>

        {/* Navigation App */}
        <div className="space-y-1.5">
          <Label className="text-xs">Navigation App</Label>
          <Select
            value={preferences.preferredNavApp}
            onValueChange={(val: string) => updatePreference('preferredNavApp', val as NavApp)}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {getAllNavApps().map(({ id, label }) => (
                <SelectItem key={id} value={id}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Theme */}
        <div className="space-y-1.5">
          <Label className="text-xs">Theme</Label>
          <Select
            value={preferences.theme}
            onValueChange={(val: string) => updatePreference('theme', val as 'auto' | 'light' | 'dark')}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">System Default</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Push Notifications */}
        <div className="flex items-center justify-between">
          <Label className="text-xs">Push Notifications</Label>
          <Switch
            checked={preferences.pushEnabled}
            onCheckedChange={(val: boolean) => updatePreference('pushEnabled', val)}
          />
        </div>

        {/* Change PIN */}
        {onChangePinTap && (
          <div className="flex items-center justify-between">
            <Label className="text-xs">Change PIN</Label>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onChangePinTap}>
              Change <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
