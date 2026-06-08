'use client';

import { useState, useEffect, useMemo } from 'react';
import { OnbordaProvider, Onborda } from 'onborda';
import { useAuthStore } from '@/features/auth';
import { SallyTourCard } from './SallyTourCard';
import { MobileTourSheet } from './MobileTourSheet';
import { TourWelcomeDialog } from './TourWelcomeDialog';
import { useTourStore } from '../store';
import { useTourStatus } from '../hooks/use-tour-status';
import { getStepsForRole, TOUR_ID } from '../tour-steps';
import { useIsMobile } from '@/shared/hooks/use-is-mobile';
import { usePlan } from '@/features/platform/plans';

interface PlatformTourProps {
  children: React.ReactNode;
}

export function PlatformTour({ children }: PlatformTourProps) {
  const { user } = useAuthStore();
  const { isActive, tourStatus, isLoading } = useTourStore();
  const [showWelcome, setShowWelcome] = useState(false);
  const isMobile = useIsMobile();
  const { hasFeature } = usePlan();

  useTourStatus();

  useEffect(() => {
    if (!isLoading && tourStatus === null && user) {
      const timer = setTimeout(() => setShowWelcome(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, tourStatus, user]);

  const onbordaSteps = useMemo(() => {
    if (!user?.role) return [];
    const steps = getStepsForRole(user.role, hasFeature);

    return [
      {
        tour: TOUR_ID,
        steps: steps.map((step) => ({
          icon: null,
          title: step.title,
          content: step.content,
          selector: step.selector,
          side: step.side as 'top' | 'bottom' | 'left' | 'right',
          showControls: false,
          pointerPadding: step.pointerPadding ?? 12,
          pointerRadius: step.pointerRadius ?? 12,
          nextRoute: step.nextRoute,
          prevRoute: step.prevRoute,
        })),
      },
    ];
  }, [user?.role, hasFeature]);

  if (!user) return <>{children}</>;

  return (
    <OnbordaProvider>
      {/* Desktop: onborda-powered tour with page navigation */}
      {!isMobile && (
        <Onborda
          steps={onbordaSteps}
          showOnborda={isActive}
          shadowRgb="0,0,0"
          shadowOpacity="0.5"
          cardComponent={SallyTourCard}
          cardTransition={{ type: 'spring', stiffness: 200, damping: 25 }}
        >
          {children}
        </Onborda>
      )}

      {/* Mobile: render children directly + show card-based tour sheet */}
      {isMobile && (
        <>
          {children}
          <MobileTourSheet
            open={isActive}
            onOpenChange={(open) => {
              if (!open) useTourStore.getState().stopTour();
            }}
          />
        </>
      )}

      <TourWelcomeDialog open={showWelcome} onOpenChange={setShowWelcome} />
    </OnbordaProvider>
  );
}
