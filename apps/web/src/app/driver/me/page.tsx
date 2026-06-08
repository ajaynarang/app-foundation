'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Fuel } from 'lucide-react';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
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
import Link from 'next/link';
import { useDriverHome } from '@/features/fleet/drivers/hooks/use-driver-home';
import { useDriverWeeklyStats } from '@/features/fleet/drivers/hooks/use-driver-weekly-stats';
import { useDriverOnboarding } from '@/features/fleet/drivers/hooks/use-driver-onboarding';
import { usePlan } from '@/features/platform/plans/hooks/use-plan';
import { DriverProfileCard, DriverProfileSkeleton } from '@/features/fleet/drivers/components/DriverProfileCard';
import { DriverWeeklyStats, DriverWeeklyStatsSkeleton } from '@/features/fleet/drivers/components/DriverWeeklyStats';
import { DriverPreferences } from '@/features/fleet/drivers/components/DriverPreferences';
import { ChangePinSheet } from '@/features/fleet/drivers/components/ChangePinSheet';

function ProfileSkeleton() {
  return (
    <div className="space-y-4 py-4">
      <DriverProfileSkeleton />
      <DriverWeeklyStatsSkeleton />
      <Skeleton className="h-40 w-full rounded-lg" />
    </div>
  );
}

export default function DriverMePage() {
  const router = useRouter();
  const { driver, driverId, isLoading } = useDriverHome();
  const { data: weeklyStats, isLoading: isStatsLoading } = useDriverWeeklyStats(driverId);
  const { resetOnboarding } = useDriverOnboarding();
  const { hasFeature } = usePlan();
  const [changePinOpen, setChangePinOpen] = useState(false);
  const [sosOpen, setSosOpen] = useState(false);

  if (isLoading) return <ProfileSkeleton />;

  return (
    <div className="space-y-4 py-4">
      <DriverProfileCard driver={driver} />

      {/* My Week — tappable weekly stats card */}
      <button className="w-full text-left space-y-2" onClick={() => router.push('/driver/me/loads')}>
        <div className="flex items-center justify-between px-0.5">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Week</span>
          <span className="text-muted-foreground text-xs">→</span>
        </div>
        <DriverWeeklyStats
          loadsCompleted={weeklyStats?.loadsCompleted}
          milesDriven={weeklyStats?.milesDriven}
          earningsCents={weeklyStats?.earningsCents}
          isLoading={isStatsLoading}
        />
      </button>

      {/* IFTA Fuel Logging — only show when add-on is active (no upsell for drivers) */}
      {hasFeature('ifta') && (
        <Card
          className="cursor-pointer hover:bg-muted/50 transition-colors"
          onClick={() => router.push('/driver/me/fuel')}
        >
          <CardContent className="flex items-center justify-between py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
                <Fuel className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Fuel Logging</p>
                <p className="text-xs text-muted-foreground">Scan receipts & log fuel purchases</p>
              </div>
            </div>
            <span className="text-muted-foreground">→</span>
          </CardContent>
        </Card>
      )}

      <DriverPreferences onChangePinTap={() => setChangePinOpen(true)} />

      {/* Help & Safety */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Help & Safety</h4>

          {/* Emergency contact */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {(driver as any)?.emergencyContactName && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Emergency contact</span>
              <a
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                href={`tel:${(driver as any).emergencyContactPhone}`}
                className="text-foreground font-medium"
              >
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {(driver as any).emergencyContactName}
              </a>
            </div>
          )}

          {/* Tour */}
          <Button
            variant="ghost"
            className="flex items-center justify-between w-full h-auto text-sm py-0.5 px-0"
            onClick={resetOnboarding}
          >
            <span className="text-foreground">Take the tour again</span>
            <span className="text-muted-foreground text-xs">→</span>
          </Button>

          {/* SOS */}
          <Button variant="destructive" className="w-full h-11 gap-2 mt-1" onClick={() => setSosOpen(true)}>
            <AlertTriangle className="h-4 w-4" />
            SOS Emergency
          </Button>
        </CardContent>
      </Card>

      {/* Legal */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Legal</h4>
          <Link href="/legal/privacy" className="flex items-center justify-between text-sm text-foreground py-1">
            Privacy Policy
            <span className="text-muted-foreground text-xs">→</span>
          </Link>
          <Link href="/legal/terms" className="flex items-center justify-between text-sm text-foreground py-1">
            Terms of Service
            <span className="text-muted-foreground text-xs">→</span>
          </Link>
        </CardContent>
      </Card>

      {/* Change PIN sheet */}
      <ChangePinSheet open={changePinOpen} onOpenChange={setChangePinOpen} />

      {/* SOS confirmation */}
      <AlertDialog open={sosOpen} onOpenChange={setSosOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Call Emergency Services?</AlertDialogTitle>
            <AlertDialogDescription>This will call 911. Only use in a genuine emergency.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-critical hover:bg-critical/90 text-white"
              onClick={() => window.open('tel:911', '_self')}
            >
              Call 911
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
