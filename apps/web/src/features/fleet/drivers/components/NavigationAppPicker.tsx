'use client';

import { Navigation } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Label } from '@sally/ui/components/ui/label';
import { useState } from 'react';
import { useDriverPreferences, type NavApp } from '../hooks/use-driver-preferences';
import { openNavigation, getAllNavApps } from '../lib/external-navigation';

interface NavigationAppPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: string;
  lat?: number;
  lng?: number;
}

const navApps = getAllNavApps();

export function NavigationAppPicker({ open, onOpenChange, address, lat, lng }: NavigationAppPickerProps) {
  const { preferences: _preferences, updatePreference } = useDriverPreferences();
  const [remember, setRemember] = useState(false);

  const handleSelect = (app: NavApp) => {
    if (remember) {
      updatePreference('preferredNavApp', app);
    }
    openNavigation(app, address, lat, lng);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Navigate with</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          {navApps.map(({ id, label }) => (
            <Button key={id} variant="outline" className="w-full justify-start h-12" onClick={() => handleSelect(id)}>
              <Navigation className="mr-2 h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(val: boolean | 'indeterminate') => setRemember(!!val)}
          />
          <Label htmlFor="remember" className="text-xs text-muted-foreground">
            Remember my choice
          </Label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook to handle navigation with saved preference or picker dialog
 */
export function useNavigationPicker() {
  const { preferences } = useDriverPreferences();
  const [pickerState, setPickerState] = useState<{
    open: boolean;
    address: string;
    lat?: number;
    lng?: number;
  }>({ open: false, address: '' });

  const navigate = (address: string, lat?: number, lng?: number) => {
    if (preferences.preferredNavApp) {
      openNavigation(preferences.preferredNavApp, address, lat, lng);
    } else {
      setPickerState({ open: true, address, lat, lng });
    }
  };

  return {
    navigate,
    pickerProps: {
      ...pickerState,
      onOpenChange: (open: boolean) => setPickerState((s) => ({ ...s, open })),
    },
  };
}
