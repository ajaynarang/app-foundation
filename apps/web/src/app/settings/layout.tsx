'use client';

import { Suspense } from 'react';
import { OAuthReturnNotice } from '@/features/platform/integrations';

/**
 * Settings layout — simplified after sidebar redesign.
 * Navigation is now handled by the main sidebar's Settings sub-panel.
 * This layout provides consistent spacing, and shows the result of an
 * integration's OAuth round trip on whichever Settings screen it returns to.
 */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <OAuthReturnNotice />
      </Suspense>
      {children}
    </div>
  );
}
