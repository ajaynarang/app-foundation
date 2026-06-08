import { CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Button } from '@sally/ui/components/ui/button';

interface BulkResolveBarProps {
  count: number;
  onResolve: () => void;
  isPending: boolean;
  onClear: () => void;
}

export function BulkResolveBar({ count, onResolve, isPending, onClear }: BulkResolveBarProps) {
  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <Card className="shadow-lg border-foreground/20">
        <CardContent className="p-3 flex items-center gap-3">
          <span className="text-sm font-medium text-foreground">{count} selected</span>
          <Button size="sm" onClick={onResolve} loading={isPending}>
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Resolve Selected
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
