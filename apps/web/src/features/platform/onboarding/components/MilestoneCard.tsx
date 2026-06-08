'use client';

import { CheckCircle2, Circle, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { cn } from '@sally/ui';
import { useRouter } from 'next/navigation';
import { openConsole } from '@/shared/lib/console-url';
import type { MilestoneStatus, OnboardingItem } from '../types';

interface MilestoneCardProps {
  milestone: MilestoneStatus;
  milestoneNumber: number;
  defaultExpanded?: boolean;
  onOpenChat?: () => void;
}

export function MilestoneCard({ milestone, milestoneNumber, defaultExpanded = false, onOpenChat }: MilestoneCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const router = useRouter();
  const isComplete = milestone.status === 'complete';
  const completedCount = milestone.items.filter((i) => i.complete).length;

  const handleItemClick = (item: OnboardingItem) => {
    if (item.complete) return;
    if (item.actionType === 'chat' && onOpenChat) {
      onOpenChat();
      return;
    }
    if (item.actionType === 'console' && item.actionLink) {
      openConsole(item.actionLink);
      return;
    }
    if (item.actionLink) {
      router.push(item.actionLink);
    }
  };

  return (
    <Card
      className={cn(
        'transition-all duration-200',
        isComplete && 'border-border',
        milestone.status === 'in_progress' && 'border-foreground/20',
      )}
    >
      <CardHeader className="cursor-pointer select-none" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                isComplete
                  ? 'bg-muted text-muted-foreground'
                  : milestone.status === 'in_progress'
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {isComplete ? <CheckCircle2 className="h-5 w-5" /> : milestoneNumber}
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">{milestone.title}</h3>
              <p className="text-sm text-muted-foreground">{milestone.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={isComplete ? 'default' : 'outline'}
              className={cn(isComplete && 'bg-muted text-muted-foreground')}
            >
              {isComplete ? 'Complete' : `${completedCount}/${milestone.items.length}`}
            </Badge>
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-3 pt-0">
          {/* Load path cards for milestone 2 */}
          {milestone.loadPaths && milestone.loadPaths.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">How do you want to bring loads into SALLY?</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {milestone.loadPaths.map((path) => (
                  <Button
                    key={path.id}
                    variant="outline"
                    onClick={() =>
                      path.actionType === 'console' ? openConsole(path.actionLink) : router.push(path.actionLink)
                    }
                    className="h-auto flex-col items-start gap-1 p-4 text-left"
                  >
                    <span className="text-sm font-semibold text-foreground">{path.title}</span>
                    <span className="text-xs font-normal text-muted-foreground">{path.description}</span>
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Milestone items */}
          <div className="space-y-1">
            {milestone.items.map((item) => (
              <Button
                key={item.id}
                variant="ghost"
                onClick={() => handleItemClick(item)}
                disabled={item.complete}
                className={cn(
                  'flex h-auto w-full items-center justify-between rounded-md px-3 py-2.5 text-left',
                  item.complete && 'cursor-default opacity-100',
                )}
              >
                <div className="flex items-center gap-3">
                  {item.complete ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  ) : (
                    <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  )}
                  <div className="text-left">
                    <span
                      className={cn(
                        'text-sm',
                        item.complete ? 'text-muted-foreground line-through' : 'font-medium text-foreground',
                      )}
                    >
                      {item.title}
                    </span>
                    <p className="text-xs font-normal text-muted-foreground">{item.description}</p>
                  </div>
                </div>
                <span className="ml-4 flex-shrink-0 text-xs font-normal text-muted-foreground">{item.statusText}</span>
              </Button>
            ))}
          </div>

          {/* Unlock message */}
          <div
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
              isComplete ? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {isComplete ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {milestone.unlockMessage}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default MilestoneCard;
