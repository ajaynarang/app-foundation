'use client';

import { useState } from 'react';
import { Map, Bot, Bell, Truck, CheckCircle } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { useDriverOnboarding } from '../hooks/use-driver-onboarding';
import { usePushNotifications } from '@/shared/hooks/use-push-notifications';

interface Screen {
  icon: React.ElementType;
  title: string;
  description: string;
}

const screens: Screen[] = [
  {
    icon: Truck,
    title: 'Welcome to SALLY',
    description: "Your smart co-driver. Let's take a quick tour.",
  },
  {
    icon: Map,
    title: 'Your Route',
    description: 'See every stop planned by Sally — pickups, deliveries, fuel, and rest.',
  },
  {
    icon: Bot,
    title: 'Meet Sally',
    description: 'Ask anything. Tap the sparkle button anytime for help.',
  },
  {
    icon: Bell,
    title: 'Stay Connected',
    description: 'Get alerts for route changes, HOS reminders, and dispatch messages.',
  },
];

export function DriverOnboarding() {
  const [current, setCurrent] = useState(0);
  const { completeOnboarding } = useDriverOnboarding();
  const { subscribe, isSubscribed, isSupported } = usePushNotifications();
  const [pushRequested, setPushRequested] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);

  const isLast = current === screens.length - 1;
  const screen = screens[current];
  const Icon = screen.icon;

  const handleEnablePush = async () => {
    setPushLoading(true);
    try {
      await subscribe();
      setPushRequested(true);
    } finally {
      setPushLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-background px-6 text-center">
      {/* Icon */}
      <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6">
        <Icon className="h-10 w-10 text-foreground" />
      </div>

      {/* Content */}
      <h1 className="text-xl font-bold text-foreground mb-2">{screen.title}</h1>
      <p className="text-sm text-muted-foreground max-w-xs mb-8">{screen.description}</p>

      {/* Push prompt on last screen */}
      {isLast && isSupported && !isSubscribed && !pushRequested && (
        <Button
          variant="outline"
          className="w-full max-w-xs h-10 mb-4"
          onClick={handleEnablePush}
          loading={pushLoading}
        >
          <Bell className="h-4 w-4 mr-2" />
          Enable Notifications
        </Button>
      )}

      {isLast && (isSubscribed || pushRequested) && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
          {isSubscribed ? 'Notifications enabled' : 'You can enable later in Settings'}
        </div>
      )}

      {/* Dots */}
      <div className="flex items-center gap-2 mb-8">
        {screens.map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-2 rounded-full transition-all',
              i === current ? 'w-6 bg-foreground' : 'w-2 bg-muted-foreground/30',
            )}
          />
        ))}
      </div>

      {/* Action */}
      {isLast ? (
        <Button className="w-full max-w-xs h-12 text-base" onClick={completeOnboarding}>
          Let&apos;s Roll!
        </Button>
      ) : (
        <Button className="w-full max-w-xs h-12 text-base" onClick={() => setCurrent(current + 1)}>
          Next
        </Button>
      )}

      {/* Skip */}
      {!isLast && (
        <Button variant="ghost" className="mt-2 text-muted-foreground" onClick={completeOnboarding}>
          Skip
        </Button>
      )}
    </div>
  );
}
