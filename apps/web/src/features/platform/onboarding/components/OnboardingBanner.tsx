'use client';

import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { useRouter, usePathname } from 'next/navigation';

interface OnboardingBannerProps {
  onDismiss: () => void;
}

export function OnboardingBanner({ onDismiss }: OnboardingBannerProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === '/setup-hub') {
    return null;
  }

  return (
    <div className="relative z-50 border-b border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-900 dark:text-amber-100" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            Connect your fleet to unlock route planning — SALLY needs your ELD, drivers, and vehicles
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/setup-hub')}
            className="border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
          >
            Complete Setup
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-7 w-7 text-amber-900 hover:bg-amber-100 dark:text-amber-100 dark:hover:bg-amber-900"
            aria-label="Dismiss banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingBanner;
