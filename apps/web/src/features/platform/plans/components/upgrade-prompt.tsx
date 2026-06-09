import { Lock } from 'lucide-react';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Button } from '@app/ui/components/ui/button';
import { Badge } from '@app/ui/components/ui/badge';
import { cn } from '@app/ui';
import { mailto } from '@/shared/lib/contacts';

interface UpgradePromptProps {
  feature: string;
  requiredPlan: string;
  description?: string;
  className?: string;
}

export function UpgradePrompt({ feature, requiredPlan, description, className }: UpgradePromptProps) {
  return (
    <Card className={cn('border-dashed border-border', className)}>
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center gap-4">
        {/* Lock icon container */}
        <div className="rounded-full bg-muted p-4">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>

        {/* Feature name + plan badge */}
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">{feature}</p>
          <Badge variant="outline" className="text-xs">
            Requires {requiredPlan}
          </Badge>
        </div>

        {/* Optional description */}
        {description && <p className="text-sm text-muted-foreground max-w-xs leading-relaxed">{description}</p>}

        {/* CTA button */}
        <a href={mailto('app')}>
          <Button variant="outline" size="sm">
            Contact Sales to Upgrade
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}
