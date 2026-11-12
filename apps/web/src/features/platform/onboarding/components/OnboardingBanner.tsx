'use client';

import { X, AlertTriangle } from 'lucide-react';
import { Button } from '@app/ui/components/ui/button';
import { useRouter, usePathname } from 'next/navigation';

interface OnboardingBannerProps {
  onDismiss: () => void;
}

export function OnboardingBanner({ onDismiss }: OnboardingBannerProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (pathname === '/onboarding') {
    return null;
  }

  return (
    <div className="relative z-50 border-b border-caution/40 bg-caution/10">
      <div className="flex items-center justify-between px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-caution-text" />
          <span className="text-sm font-medium text-caution-text">
            Finish setting up your workspace to unlock everything — invite your team and configure your settings
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push('/onboarding')}
            className="border-caution/40 bg-caution/15 text-caution-text hover:bg-caution/25"
          >
            Complete Setup
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDismiss}
            className="h-7 w-7 text-caution-text hover:bg-caution/15"
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
