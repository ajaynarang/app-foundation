'use client';

import { useEffect } from 'react';
import { Rocket } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Progress } from '@sally/ui/components/ui/progress';
import { MilestoneCard } from '@/features/platform/onboarding/components/MilestoneCard';
import { SallyAiCallout } from '@/features/platform/onboarding/components/SallyAiCallout';
import { useOnboardingStore } from '@/features/platform/onboarding';
import { useAuth } from '@/features/auth';
import { useRouter } from 'next/navigation';

export default function SetupHubPage() {
  const { user, isAuthenticated } = useAuth();
  const { status, loading, fetchStatus } = useOnboardingStore();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated && (user?.role === 'OWNER' || user?.role === 'ADMIN')) {
      fetchStatus();
    }
  }, [isAuthenticated, user?.role, fetchStatus]);

  if (isAuthenticated && user && user.role !== 'OWNER' && user.role !== 'ADMIN') {
    router.push('/');
    return null;
  }

  if (loading || !status) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-foreground" />
      </div>
    );
  }

  const handleOpenChat = () => {
    window.dispatchEvent(new CustomEvent('open-sally-chat'));
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Hero Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5">
              <Rocket className="h-6 w-6 text-foreground" />
            </div>
            <div>
              <CardTitle className="text-2xl">Setup Hub</CardTitle>
              <p className="text-sm text-muted-foreground">Get SALLY ready to plan your routes</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {status.completedItems} of {status.totalItems} complete
              </span>
              <span className="text-sm font-semibold">{status.overallProgress}%</span>
            </div>
            <Progress value={status.overallProgress} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* SALLY AI Callout */}
      <SallyAiCallout onOpenChat={handleOpenChat} />

      {/* Milestones */}
      {status.milestones.map((milestone, index) => (
        <MilestoneCard
          key={milestone.id}
          milestone={milestone}
          milestoneNumber={index + 1}
          defaultExpanded={milestone.status === 'in_progress' || (index === 0 && milestone.status !== 'complete')}
          onOpenChat={handleOpenChat}
        />
      ))}
    </div>
  );
}
