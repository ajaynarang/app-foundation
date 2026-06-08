'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { FeatureGuard } from '@/features/platform/feature-flags';
import { ComplianceTrendReport } from '@/features/analytics/components/compliance-trend/compliance-trend-report';

/**
 * Compliance Trend — the History tab from `/dispatcher/shield`, promoted
 * into its own Insights report. Phase B of the workspace ↔ insights
 * split (`.docs/plans/18-reporting/2026-05-20-workspace-vs-insights-
 * master-plan.md`). Shield retains today's posture (ScoreHero +
 * findings) — trend over time belongs here.
 */
function ComplianceTrendContent() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Header — same chrome as other Insights reports for consistency */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Back to insights"
            onClick={() => router.push('/dispatcher/insights')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance Trend</h1>
            <p className="text-sm text-muted-foreground">Shield score history and past audits</p>
          </div>
        </div>
      </div>

      <ComplianceTrendReport />
    </div>
  );
}

export default function ComplianceTrendPage() {
  return (
    <FeatureGuard featureKey="insights">
      <ComplianceTrendContent />
    </FeatureGuard>
  );
}
