'use client';

import { Map as MapIcon, PanelLeft, PanelRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@sally/ui';
import { ToggleGroup, ToggleGroupItem } from '@sally/ui/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sally/ui/components/ui/tooltip';
import type { TowerColumn, TowerLayoutState } from '../../hooks/use-tower-layout';

interface PanelToggleGroupProps {
  layout: TowerLayoutState;
}

interface PanelToggle {
  value: TowerColumn | 'map';
  icon: LucideIcon;
  label: string;
}

/**
 * The Spine and Map toggles share the panel triad below. Map is the anchor —
 * it can never be hidden, so its toggle is always pressed and disabled.
 */
const PANEL_TOGGLES: PanelToggle[] = [
  { value: 'spine', icon: PanelLeft, label: 'Spine' },
  { value: 'map', icon: MapIcon, label: 'Map' },
  { value: 'wire', icon: PanelRight, label: 'Wire' },
];

/**
 * IDE-style panel-visibility control for the Tower topbar — three small toggle
 * buttons (Spine · Map · Wire), like the VS Code side-bar / panel toggles. A
 * pressed toggle means the panel is shown; clicking it hides the panel and the
 * map reclaims the space. The Map toggle is always-on and disabled (anchor).
 *
 * Multi-select `ToggleGroup`: `value` is the set of currently-shown panels.
 */
export function PanelToggleGroup({ layout }: PanelToggleGroupProps) {
  const value = [layout.spineVisible ? 'spine' : null, 'map', layout.wireVisible ? 'wire' : null].filter(
    (v): v is string => v !== null,
  );

  const handleChange = (next: string[]) => {
    const wantSpine = next.includes('spine');
    const wantWire = next.includes('wire');
    if (wantSpine !== layout.spineVisible) layout.toggleVisibility('spine');
    if (wantWire !== layout.wireVisible) layout.toggleVisibility('wire');
  };

  return (
    <ToggleGroup
      type="multiple"
      size="sm"
      value={value}
      onValueChange={handleChange}
      aria-label="Panel visibility"
      className="gap-0.5 rounded-md border border-border bg-muted/40 p-0.5"
    >
      {PANEL_TOGGLES.map(({ value: panelValue, icon: Icon, label }) => {
        const isMap = panelValue === 'map';
        const isShown = value.includes(panelValue);
        return (
          <Tooltip key={panelValue}>
            <TooltipTrigger asChild>
              <ToggleGroupItem
                value={panelValue}
                disabled={isMap}
                aria-label={isMap ? `${label} panel (always shown)` : `${isShown ? 'Hide' : 'Show'} ${label} panel`}
                className={cn(
                  'h-7 min-w-7 px-1.5 text-muted-foreground',
                  'data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm',
                  isMap && 'disabled:opacity-100',
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </ToggleGroupItem>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isMap ? `${label} · anchor panel` : `${isShown ? 'Hide' : 'Show'} ${label}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </ToggleGroup>
  );
}
