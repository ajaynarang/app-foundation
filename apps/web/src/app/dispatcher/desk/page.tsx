'use client';

import { FeatureGuard } from '@/features/platform/feature-flags';

import { DeskLayout } from '@/features/desk/components/desk-layout';

// DeskLayout follows the canonical page chrome (PageHeader + PageToolbar with
// underline PageTabs). See sally-frontend-patterns §15.4 (Page Chrome).
export default function DeskPage() {
  return (
    <FeatureGuard featureKey="sallys_desk">
      <DeskLayout />
    </FeatureGuard>
  );
}
