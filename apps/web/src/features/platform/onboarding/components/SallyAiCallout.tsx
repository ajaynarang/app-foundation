'use client';

import { MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';

interface SallyAiCalloutProps {
  onOpenChat: () => void;
}

export function SallyAiCallout({ onOpenChat }: SallyAiCalloutProps) {
  return (
    <Card className="border-border/50 bg-accent/30">
      <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">SALLY is here to help</h3>
            <p className="text-sm text-muted-foreground">
              Your AI fleet assistant can answer questions, explain HOS rules, and help you navigate the platform.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenChat} className="flex-shrink-0">
          <MessageCircle className="mr-2 h-4 w-4" />
          Open SALLY Chat
        </Button>
      </CardContent>
    </Card>
  );
}

export default SallyAiCallout;
