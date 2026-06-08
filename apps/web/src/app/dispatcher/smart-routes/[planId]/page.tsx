'use client';

import { use, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useRoutePlan, useRoutePlanGeoJSON } from '@/features/routing/route-planning';
import { useAssignWithRoute } from '@/features/routing/smart-assign';
import dynamic from 'next/dynamic';
import { PlanDetailPanel } from '@/features/routing/route-planning/components/PlanDetailPanel';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Alert, AlertDescription } from '@sally/ui/components/ui/alert';
import { Button } from '@sally/ui/components/ui/button';
import { PlanMapOverlay } from '@/features/routing/route-planning/components/PlanMapOverlay';

const PlanMap = dynamic(
  () => import('@/features/routing/route-planning/components/PlanMap').then((mod) => mod.PlanMap),
  {
    ssr: false,
    loading: () => <Skeleton className="h-full w-full rounded-none" />,
  },
);

export default function PlanDetailPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  // Assign mode: came from Smart Assign sheet after generating a route
  const isAssignMode = searchParams.get('assign') === 'true';
  const assignLoadId = searchParams.get('loadId');

  const { data: plan, isLoading, error } = useRoutePlan(planId);
  const { data: geojson, isLoading: isGeoJSONLoading } = useRoutePlanGeoJSON(planId);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);

  const assignWithRoute = useAssignWithRoute();
  const [assigned, setAssigned] = useState(false);

  const handleAssign = () => {
    if (!assignLoadId || !planId) return;
    assignWithRoute.mutate(
      { loadId: assignLoadId, planId },
      {
        onSuccess: () => {
          // Strip assign query params to prevent stale state on refresh
          router.replace(`/dispatcher/smart-routes/${planId}`);
          setAssigned(true);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="-m-4 md:-m-8 flex h-[calc(100vh-64px)]">
        <div className="hidden lg:block w-[60%]">
          <Skeleton className="h-full w-full rounded-none" />
        </div>
        <div className="flex-1 lg:w-[40%] border-l border-border p-4 space-y-4 overflow-y-auto bg-background">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error || !plan) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>
            {error ? `Failed to load plan: ${(error as Error).message}` : 'Plan not found.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Post-assign success state
  if (assigned) {
    return (
      <div className="-m-4 md:-m-8 flex h-[calc(100vh-64px)] items-center justify-center bg-background">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">✓</div>
          <h2 className="text-lg font-semibold text-foreground">Load Assigned</h2>
          <p className="text-sm text-muted-foreground">Smart Route activated for this load.</p>
          <div className="flex flex-col gap-2 pt-4">
            <Button onClick={() => router.push('/dispatcher/loads?status=pending')}>Next Load →</Button>
            <Button
              variant="outline"
              onClick={() => {
                setAssigned(false); // Show the plan detail view
              }}
            >
              View Smart Route
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-4 md:-m-8 flex h-[calc(100vh-64px)] flex-col lg:flex-row">
      {/* Left: Map (60%) — hidden on mobile, shown on lg+ */}
      <div className="hidden lg:block lg:w-[60%] relative">
        <PlanMap
          geojson={geojson}
          isLoading={isGeoJSONLoading}
          selectedSegmentId={selectedSegmentId}
          hoveredSegmentId={hoveredSegmentId}
          onSegmentSelect={setSelectedSegmentId}
        />
        <PlanMapOverlay plan={plan} />
      </div>

      {/* Right: Details (40% on desktop, full width on mobile) */}
      <div className="flex-1 lg:w-[40%] border-l border-border overflow-y-auto bg-background">
        <PlanDetailPanel
          plan={plan}
          variant="detail"
          selectedSegmentId={selectedSegmentId}
          onSegmentSelect={setSelectedSegmentId}
          hoveredSegmentId={hoveredSegmentId}
          onSegmentHover={setHoveredSegmentId}
          onAssign={isAssignMode && assignLoadId ? handleAssign : undefined}
          isAssigning={assignWithRoute.isPending}
        />
      </div>
    </div>
  );
}
