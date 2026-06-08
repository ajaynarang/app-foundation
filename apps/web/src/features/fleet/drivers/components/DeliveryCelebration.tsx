'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';

interface DeliveryCelebrationProps {
  loadNumber: string;
  onDismiss: () => void;
}

export function DeliveryCelebration({ loadNumber, onDismiss }: DeliveryCelebrationProps) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onDismiss();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!visible) return null;

  return (
    <Card className="border-border">
      <CardContent className="p-6 flex flex-col items-center text-center space-y-3">
        <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-foreground" />
        </div>
        <div>
          <p className="text-lg font-semibold text-foreground">Delivered!</p>
          <p className="text-sm text-muted-foreground">Load {loadNumber} has been completed</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setVisible(false);
            onDismiss();
          }}
          className="min-h-[44px]"
        >
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}
