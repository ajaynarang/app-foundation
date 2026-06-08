'use client';

import { Card, CardContent } from '@app/ui/components/ui/card';
import { ExternalLink, ArrowRight } from 'lucide-react';
import { openConsole } from '@/shared/lib/console-url';

interface ConsoleRedirectStubProps {
  /** What was moved, e.g. "Operations settings" */
  title: string;
  /** Console path, e.g. "/configuration/operations" */
  consolePath: string;
}

export function ConsoleRedirectStub({ title, consolePath }: ConsoleRedirectStubProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <ArrowRight className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{title} moved to Console</h2>
          <p className="text-sm text-muted-foreground">
            This page is now managed in SALLY Console. You can always access Console from the sidebar menu.
          </p>
          <button
            onClick={() => openConsole(consolePath)}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Open in Console
            <ExternalLink className="h-4 w-4" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
