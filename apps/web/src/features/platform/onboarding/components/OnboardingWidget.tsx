'use client';

import { CheckCircle2, Circle, Rocket } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { Progress } from '@sally/ui/components/ui/progress';
import { useRouter } from 'next/navigation';
import type { OnboardingStatusResponse } from '../types';

interface OnboardingWidgetProps {
  status: OnboardingStatusResponse;
}

export function OnboardingWidget({ status }: OnboardingWidgetProps) {
  const router = useRouter();

  const activeMilestone =
    status.milestones.find((m) => m.status === 'in_progress') ??
    status.milestones.find((m) => m.status === 'available');

  const incompleteItems = activeMilestone?.items.filter((i) => !i.complete) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-5 w-5" />
          Setup Hub
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {status.completedItems}/{status.totalItems} complete
            </span>
            <span className="font-medium">{status.overallProgress}%</span>
          </div>
          <Progress value={status.overallProgress} className="h-2" />
        </div>

        {activeMilestone && incompleteItems.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground">{activeMilestone.title}</h4>
            {incompleteItems.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center gap-2 text-sm">
                <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span className="text-foreground">{item.title}</span>
              </div>
            ))}
          </div>
        )}

        {!activeMilestone && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <span>All set up!</span>
          </div>
        )}

        <Button onClick={() => router.push('/setup-hub')} className="w-full" variant="outline">
          Continue Setup →
        </Button>
      </CardContent>
    </Card>
  );
}

export default OnboardingWidget;
