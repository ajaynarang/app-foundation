'use client';

import { MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';

interface AssistantAiCalloutProps {
  onOpenChat: () => void;
}

export function AssistantAiCallout({ onOpenChat }: AssistantAiCalloutProps) {
  return (
    <Card className="border-border/50 bg-accent/30">
      <CardContent className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-foreground text-background">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">The Assistant is here to help</h3>
            <p className="text-sm text-muted-foreground">
              Your AI assistant can answer questions, explain how things work, and help you navigate the platform.
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpenChat} className="flex-shrink-0">
          <MessageCircle className="mr-2 h-4 w-4" />
          Open Assistant Chat
        </Button>
      </CardContent>
    </Card>
  );
}

export default AssistantAiCallout;
