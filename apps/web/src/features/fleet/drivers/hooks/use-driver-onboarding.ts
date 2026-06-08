import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { STORAGE_KEYS } from '@/shared/constants';

const STORAGE_KEY = STORAGE_KEYS.DRIVER_ONBOARDING_COMPLETE;

export function useDriverOnboarding() {
  const router = useRouter();
  const [hasCompleted, setHasCompleted] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY) === 'true';
  });

  const completeOnboarding = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, 'true');
    setHasCompleted(true);
    router.replace('/driver/home');
  }, [router]);

  const resetOnboarding = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasCompleted(false);
    router.push('/driver/onboarding');
  }, [router]);

  return {
    hasCompletedOnboarding: hasCompleted,
    completeOnboarding,
    resetOnboarding,
  };
}
