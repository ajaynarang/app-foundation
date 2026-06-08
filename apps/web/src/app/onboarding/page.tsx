'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';
import { CheckCircle } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { getDefaultRouteForRole } from '@/shared/lib/navigation';

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to SALLY',
      description: "Let's get your organization set up",
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">
            SALLY is your complete dispatch and driver coordination platform. This quick setup will help you get
            started.
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-muted-foreground" />
              <span className="text-foreground">Your account has been approved</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-muted-foreground" />
              <span className="text-foreground">Your organization is ready</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-muted-foreground" />
              <span className="text-foreground">You can start inviting your team</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Setup Complete',
      description: "You're ready to start using SALLY",
      content: (
        <div className="space-y-4">
          <p className="text-muted-foreground">Your organization is now set up! You can:</p>
          <ul className="list-disc list-inside space-y-2 text-foreground">
            <li>Invite dispatchers and drivers from the Users page</li>
            <li>Activate synced drivers from the Drivers page</li>
            <li>Configure integrations from the Settings page</li>
            <li>Start planning routes</li>
          </ul>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Redirect to role-specific dashboard
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const defaultRoute = getDefaultRouteForRole(user?.role as any);
      router.push(defaultRoute);
    }
  };

  const handleSkip = () => {
    // Redirect to role-specific dashboard
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const defaultRoute = getDefaultRouteForRole(user?.role as any);
    router.push(defaultRoute);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{steps[currentStep].title}</CardTitle>
          <CardDescription>{steps[currentStep].description}</CardDescription>
        </CardHeader>
        <CardContent>{steps[currentStep].content}</CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={handleSkip}>
            Skip Setup
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {steps.length}
            </span>
            <Button onClick={handleNext}>{currentStep < steps.length - 1 ? 'Next' : 'Go to Dashboard'}</Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
