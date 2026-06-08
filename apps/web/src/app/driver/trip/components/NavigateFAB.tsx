'use client';

import { useState } from 'react';
import { Navigation } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Label } from '@sally/ui/components/ui/label';
import { useDriverPreferences, type NavApp } from '@/features/fleet/drivers/hooks/use-driver-preferences';
import { openNavigation, getAllNavApps } from '@/features/fleet/drivers/lib/external-navigation';

interface NavigateFABProps {
  destinationLat: number;
  destinationLon: number;
  destinationName?: string;
  /** Only render during drive segments — caller controls this */
  visible: boolean;
}

const navApps = getAllNavApps();

export function NavigateFAB({ destinationLat, destinationLon, destinationName, visible }: NavigateFABProps) {
  const { preferences, updatePreference } = useDriverPreferences();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [remember, setRemember] = useState(false);

  const handleFabPress = () => {
    if (preferences.preferredNavApp) {
      openNavigation(preferences.preferredNavApp, destinationName ?? '', destinationLat, destinationLon);
    } else {
      setPickerOpen(true);
    }
  };

  const handleSelectApp = (app: NavApp) => {
    if (remember) {
      updatePreference('preferredNavApp', app);
    }
    openNavigation(app, destinationName ?? '', destinationLat, destinationLon);
    setPickerOpen(false);
  };

  return (
    <>
      {/* FAB — positioned fixed bottom-right, 56px above tab bar */}
      <div
        className={[
          'fixed bottom-[calc(var(--tab-bar-height,64px)+12px)] right-4 z-40',
          'transition-all duration-200 ease-out',
          visible ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-4 opacity-0 pointer-events-none',
        ].join(' ')}
        aria-hidden={!visible}
      >
        <Button
          size="icon"
          onClick={handleFabPress}
          aria-label={`Navigate to ${destinationName ?? 'destination'}`}
          className={cn(
            'h-14 w-14 rounded-full shadow-lg',
            'bg-info text-info-foreground hover:bg-info/90',
            'active:scale-95 transition-transform',
          )}
        >
          <Navigation className="h-6 w-6" aria-hidden />
        </Button>
      </div>

      {/* App picker dialog — shown when no preference is saved */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Navigate with</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            {navApps.map(({ id, label }) => (
              <Button
                key={id}
                variant="outline"
                className="w-full justify-start h-12 min-h-[44px]"
                onClick={() => handleSelectApp(id)}
              >
                <Navigation className="mr-2 h-4 w-4" aria-hidden />
                {label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Checkbox
              id="nav-remember"
              checked={remember}
              onCheckedChange={(val: boolean | 'indeterminate') => setRemember(!!val)}
            />
            <Label htmlFor="nav-remember" className="text-xs text-muted-foreground">
              Remember my choice
            </Label>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
