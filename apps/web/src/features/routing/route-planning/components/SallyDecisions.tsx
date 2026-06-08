'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import type { RouteSegment, RoutePlanResult } from '@/features/routing/route-planning';
import { formatDurationHours as formatDuration } from '@/shared/lib/format-time';

interface SallyDecisionsProps {
  plan: RoutePlanResult;
}

function computeDecisions(segments: RouteSegment[]) {
  let restStops = 0;
  let breaks = 0;
  let fuelStops = 0;
  let totalFuelCost = 0;
  let totalFuelGallons = 0;
  let dockRestConversions = 0;
  let totalRestHours = 0;
  const restReasons: string[] = [];
  const fuelDetails: Array<{ name: string; cost: number; detour: number }> = [];

  for (const seg of segments) {
    if (seg.segmentType === 'rest') {
      restStops++;
      totalRestHours += seg.restDurationHours || 0;
      if (seg.restReason) restReasons.push(seg.restReason);
    }
    if (seg.segmentType === 'break') breaks++;
    if (seg.segmentType === 'fuel') {
      fuelStops++;
      totalFuelCost += seg.fuelCostEstimate || 0;
      totalFuelGallons += seg.fuelGallons || 0;
      fuelDetails.push({
        name: seg.fuelStationName || seg.toLocation || 'Fuel Stop',
        cost: seg.fuelCostEstimate || 0,
        detour: seg.detourMiles || 0,
      });
    }
    if (seg.segmentType === 'dock' && seg.isDocktimeConverted) dockRestConversions++;
  }

  return {
    restStops,
    breaks,
    fuelStops,
    totalFuelCost,
    totalFuelGallons,
    dockRestConversions,
    totalRestHours,
    restReasons,
    fuelDetails,
  };
}

function formatRestType(type?: string): string {
  switch (type) {
    case 'auto':
      return 'Auto';
    case 'full':
      return 'Full rest only';
    case 'split_8_2':
      return 'Split 8+2';
    case 'split_7_3':
      return 'Split 7+3';
    default:
      return 'Auto';
  }
}

function formatPriority(priority?: string): string {
  switch (priority) {
    case 'minimize_time':
      return 'Fastest';
    case 'minimize_cost':
      return 'Cheapest';
    case 'balance':
      return 'Balanced';
    default:
      return 'Balanced';
  }
}

export function SallyDecisions({ plan }: SallyDecisionsProps) {
  const decisions = computeDecisions(plan.segments);
  const params = plan.dispatcherParams;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">SALLY&apos;s Decisions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        {/* HOS Compliance */}
        <div>
          <div className="font-medium text-foreground mb-1">HOS Compliance</div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>{plan.isFeasible ? 'Zero violations — fully compliant route' : 'Feasibility issues detected'}</div>
            {decisions.restStops > 0 && (
              <div>
                {decisions.restStops} rest stop{decisions.restStops > 1 ? 's' : ''} inserted (
                {formatDuration(decisions.totalRestHours)} total off-duty)
              </div>
            )}
            {decisions.breaks > 0 && (
              <div>
                {decisions.breaks} mandatory 30-min break{decisions.breaks > 1 ? 's' : ''}
              </div>
            )}
            {decisions.dockRestConversions > 0 && (
              <div>
                {decisions.dockRestConversions} dock stop{decisions.dockRestConversions > 1 ? 's' : ''} credited as rest
              </div>
            )}
          </div>
          {/* Rest reasoning */}
          {decisions.restReasons.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {decisions.restReasons.map((reason, i) => (
                <div key={i} className="text-2xs text-muted-foreground italic border-l-2 border-border pl-2">
                  {reason}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Fuel */}
        {decisions.fuelStops > 0 && (
          <div>
            <div className="font-medium text-foreground mb-1">Fuel Optimization</div>
            <div className="space-y-0.5 text-muted-foreground">
              <div>
                {decisions.fuelStops} fuel stop{decisions.fuelStops > 1 ? 's' : ''} ·{' '}
                {decisions.totalFuelGallons.toLocaleString(undefined, { maximumFractionDigits: 0 })} gal · $
                {decisions.totalFuelCost.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              {decisions.fuelDetails.map((fuel, i) => (
                <div key={i} className="text-2xs">
                  {fuel.name}: ${fuel.cost.toFixed(2)}
                  {fuel.detour > 0 && ` (${fuel.detour.toFixed(1)}mi detour)`}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Your Preferences — confirmed honored */}
        {params && (
          <div>
            <div className="font-medium text-foreground mb-1">Your Preferences</div>
            <div className="space-y-0.5 text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">✓</span>
                <span>Priority: {formatPriority(plan.optimizationPriority)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">✓</span>
                <span>Rest type: {formatRestType(params.preferredRestType)}</span>
              </div>
              {params.avoidTollRoads && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">✓</span>
                  <span>Avoiding toll roads</span>
                </div>
              )}
              {params.maxDetourMilesForFuel && (
                <div className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">✓</span>
                  <span>Max {params.maxDetourMilesForFuel}mi fuel detour</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Compliance report */}
        {plan.complianceReport && (
          <div>
            <div className="font-medium text-foreground mb-1">Compliance Report</div>
            <div className="space-y-0.5 text-muted-foreground">
              {plan.complianceReport.rules?.map((rule, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className={rule.status === 'pass' ? 'text-muted-foreground' : 'text-caution'}>
                    {rule.status === 'pass' ? '✓' : '⚠'}
                  </span>
                  <span>{rule.rule}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weather */}
        {plan.weatherAlerts && plan.weatherAlerts.length > 0 && (
          <div>
            <div className="font-medium text-foreground mb-1">Weather</div>
            <div className="space-y-0.5 text-muted-foreground">
              {plan.weatherAlerts.map((alert, i) => (
                <div key={i}>
                  <span
                    className={
                      alert.severity === 'severe'
                        ? 'text-critical font-medium'
                        : alert.severity === 'moderate'
                          ? 'text-caution font-medium'
                          : ''
                    }
                  >
                    {alert.severity === 'severe' ? 'SEVERE' : alert.severity === 'moderate' ? 'WARNING' : 'INFO'}
                  </span>{' '}
                  {alert.description}
                  {alert.driveTimeMultiplier > 1 && (
                    <span className="text-2xs">
                      {' '}
                      (+{Math.round((alert.driveTimeMultiplier - 1) * 100)}% drive time)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
