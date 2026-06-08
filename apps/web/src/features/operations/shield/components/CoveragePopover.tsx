import { Popover, PopoverContent, PopoverTrigger } from '@sally/ui/components/ui/popover';
import { Button } from '@sally/ui/components/ui/button';
import type { ShieldCoverageItem } from '../types';

interface CoveragePopoverProps {
  category: string;
  items: ShieldCoverageItem[];
}

export function CoveragePopover({ category, items }: CoveragePopoverProps) {
  const ruleItems = items.filter((i) => i.source === 'rule');
  const aiItems = items.filter((i) => i.source === 'ai');

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 min-h-[24px] min-w-[24px] rounded-full border border-border text-muted-foreground text-2xs leading-none"
        >
          i
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="start">
        <div className="text-sm font-semibold text-foreground mb-3">{category} Compliance Checks</div>

        {ruleItems.length > 0 && (
          <>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Rule Engine <span className="ml-1 px-1.5 py-0.5 bg-muted rounded text-2xs">{ruleItems.length}</span>
            </div>
            <div className="space-y-1 mb-3">
              {ruleItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span className="text-foreground/80 flex-1">{item.check}</span>
                  {item.regulation && (
                    <span className="text-muted-foreground/50 font-mono text-2xs shrink-0">{item.regulation}</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {aiItems.length > 0 && (
          <>
            <div className="h-px bg-border my-3" />
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Sally AI</div>
            <div className="space-y-1">
              {aiItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <span className="w-1.5 h-1.5 rounded-sm bg-info flex-shrink-0" />
                  <span className="text-info">{item.check}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
