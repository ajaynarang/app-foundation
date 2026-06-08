'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@app/ui/components/ui/card';

export function VisualizationArea() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>REST Optimization Results</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Visualization area - run the optimizer to see results
        </div>
      </CardContent>
    </Card>
  );
}
