'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
import { formatHours } from './plan-utils';
import type { RoutePlanResult } from '../types';

interface ComplianceSummaryProps {
  plan: RoutePlanResult;
}

interface ComplianceItemProps {
  label: string;
  value: string;
  icon?: string;
  note?: string;
}

function ComplianceItem({ label, value, icon, note }: ComplianceItemProps) {
  return (
    <div className="p-2.5 bg-muted/30 rounded-md border border-border">
      <div className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="flex items-center gap-1.5 text-sm font-semibold font-mono text-foreground">
        {icon && <span className="text-xs">{icon}</span>}
        {value}
      </div>
      {note && <div className="text-2xs text-muted-foreground mt-0.5">{note}</div>}
    </div>
  );
}

export function ComplianceSummary({ plan }: ComplianceSummaryProps) {
  const report = plan.complianceReport;
  const segments = plan.segments;

  // Count segment types
  const restStops = segments.filter((s) => s.segmentType === 'rest').length;
  const fuelStops = segments.filter((s) => s.segmentType === 'fuel').length;
  const breaks = segments.filter((s) => s.segmentType === 'break').length;
  const dockRestConversions = segments.filter((s) => s.segmentType === 'dock' && s.isDocktimeConverted).length;

  // Total fuel cost
  const totalFuelCost = segments
    .filter((s) => s.segmentType === 'fuel')
    .reduce((sum, s) => sum + (s.fuelCostEstimate || 0), 0);

  // Cycle remaining: last segment's HOS state
  const lastHOS = [...segments].reverse().find((s) => s.hosStateAfter)?.hosStateAfter;
  const cycleRemaining = lastHOS ? 70 - lastHOS.cycleHoursUsed : null;

  // Check 34h restart need
  const needs34h = report.total34hRestarts > 0;

  // Rest type note
  const restTypeNote =
    dockRestConversions > 0
      ? `${dockRestConversions} dock credited`
      : report.totalSplitRests > 0
        ? `${report.totalSplitRests} split`
        : undefined;

  // Real per-rule statuses (derived by the engine from peak HOS usage).
  const rules = report.rules ?? [];
  const hasViolation = rules.some((r) => r.status === 'violation');
  const hasWarning = rules.some((r) => r.status === 'addressed');
  // Collapsed by default only when the plan is fully compliant with zero warnings —
  // verdict pill is enough; the body is visual noise. Anything actionable stays expanded.
  const defaultOpen = hasViolation || hasWarning || !report.isFullyCompliant;
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const ruleStyle = (status: string) => {
    if (status === 'violation') return { icon: '✗', cls: 'text-critical' };
    if (status === 'addressed') return { icon: '✓', cls: 'text-amber-500 dark:text-amber-400' };
    return { icon: '✓', cls: 'text-emerald-500 dark:text-emerald-400' };
  };

  return (
    <Card>
      <CardContent className="py-3 px-4">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-foreground flex items-center gap-2">
              Compliance Summary
              {hasViolation ? (
                <span className="text-2xs font-normal text-critical bg-critical/10 px-1.5 py-0.5 rounded">
                  Violation
                </span>
              ) : (
                report.isFullyCompliant && (
                  <span className="text-2xs font-normal text-emerald-500 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-400/10 px-1.5 py-0.5 rounded">
                    Compliant
                  </span>
                )
              )}
            </h3>
            <CollapsibleTrigger
              aria-label={isOpen ? 'Collapse compliance details' : 'Expand compliance details'}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="grid grid-cols-2 gap-2">
              <ComplianceItem
                label="HOS Violations"
                value={plan.feasibilityIssues?.length > 0 ? String(plan.feasibilityIssues.length) : '0'}
                icon={report.isFullyCompliant && plan.feasibilityIssues?.length === 0 ? '\u2713' : '\u26A0'}
              />
              <ComplianceItem label="Rest Stops" value={String(restStops)} note={restTypeNote} />
              <ComplianceItem
                label="Fuel Stops"
                value={String(fuelStops)}
                note={
                  totalFuelCost > 0
                    ? `$${totalFuelCost.toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                      })} est`
                    : undefined
                }
              />
              <ComplianceItem label="30-min Breaks" value={String(breaks)} />
              <ComplianceItem
                label="Cycle After Trip"
                value={cycleRemaining !== null ? `${formatHours(cycleRemaining)} / 70h` : 'N/A'}
              />
              <ComplianceItem
                label="34h Restart"
                value={needs34h ? 'Required' : 'Not needed'}
                icon={needs34h ? '\u26A0' : '\u2713'}
              />
            </div>

            {/* Real FMCSA rule statuses from the engine (pass / addressed / violation). */}
            {rules.length > 0 && (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
                {rules.map((r) => {
                  const s = ruleStyle(r.status);
                  return (
                    <li key={r.rule} className="flex items-start gap-2 text-xs">
                      <span className={`mt-0.5 ${s.cls}`} aria-hidden="true">
                        {s.icon}
                      </span>
                      <span className="flex-1">
                        <span className="text-foreground">{r.rule}</span>
                        {r.status === 'violation' && <span className="text-critical font-medium"> — violation</span>}
                        {r.status === 'addressed' && (
                          <span className="text-amber-500 dark:text-amber-400"> — addressed</span>
                        )}
                        {r.detail && <span className="block text-2xs text-muted-foreground">{r.detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}
