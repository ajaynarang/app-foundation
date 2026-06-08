'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DriverOnboarding } from '@/features/fleet/drivers/components/DriverOnboarding';
import { useDriverOnboarding } from '@/features/fleet/drivers/hooks/use-driver-onboarding';

export default function DriverOnboardingPage() {
  const router = useRouter();
  const { hasCompletedOnboarding } = useDriverOnboarding();

  useEffect(() => {
    if (hasCompletedOnboarding) {
      router.replace('/driver/trip');
    }
  }, [hasCompletedOnboarding, router]);

  if (hasCompletedOnboarding) return null;

  return <DriverOnboarding />;
}
