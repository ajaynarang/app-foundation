'use client';

import { FeatureGuard } from '@/features/platform/feature-flags';
import { LoginActivityPage } from '@/features/login-activity';

export default function SettingsSecurityPage() {
  return (
    <FeatureGuard featureKey="login_activity">
      <LoginActivityPage mode="tenant-admin" />
    </FeatureGuard>
  );
}
