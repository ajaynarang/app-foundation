'use client';

import { ChevronDown } from 'lucide-react';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@sally/ui/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@sally/ui/components/ui/collapsible';
import type { LoginActivitySummary } from '../types';

interface NotableCardProps {
  summary?: LoginActivitySummary;
  onViewAllBruteForce: () => void;
  onViewAllNewIp: () => void;
  onViewAllOffHours: () => void;
}

/**
 * Collapsible card with three sub-sections:
 *  - Brute-force suspects (users with 5+ failures in range)
 *  - New-IP sign-ins (success from an IP not seen for the user in prior 30d)
 *  - Off-hours sign-ins (outside 06:00–22:00 tenant-local)
 *
 * Each sub-section caps the list at 5 items + a "View all" link that filters
 * the main table and scrolls to it (parent owns both behaviours).
 */
export function NotableCard({ summary, onViewAllBruteForce, onViewAllNewIp, onViewAllOffHours }: NotableCardProps) {
  if (!summary) return null;
  const { notable, timezoneUsed } = summary;
  const hasAny = notable.bruteForceSuspects.length || notable.newIpSignIns.length || notable.offHoursSignIns.length;

  if (!hasAny) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notable activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No notable activity in this range.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible defaultOpen>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Notable activity</CardTitle>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Toggle notable activity">
              <ChevronDown className="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            <NotableSection
              title="Brute-force suspects"
              hint="Users with 5+ failed sign-ins in the range"
              items={notable.bruteForceSuspects.map((s) => ({
                key: `bf-${s.userId}`,
                text: `${s.email} — ${s.count} failures${s.hasOneHourBurst ? ' (1h burst)' : ''}`,
              }))}
              onViewAll={onViewAllBruteForce}
            />
            <NotableSection
              title="New-IP sign-ins"
              hint="Successful sign-ins from an IP not seen for that user in the prior 30 days"
              items={notable.newIpSignIns.map((e) => ({
                key: `nip-${e.eventId}`,
                text: `${e.email} — ${e.ip ?? '—'} at ${new Date(e.occurredAt).toLocaleString()}`,
              }))}
              onViewAll={onViewAllNewIp}
            />
            <NotableSection
              title={`Off-hours sign-ins (${timezoneUsed})`}
              hint="Successful sign-ins outside business hours (06:00–22:00 tenant-local)"
              items={notable.offHoursSignIns.map((e) => ({
                key: `oh-${e.eventId}`,
                text: `${e.email} at ${new Date(e.occurredAt).toLocaleString()}`,
              }))}
              onViewAll={onViewAllOffHours}
            />
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

interface NotableSectionProps {
  title: string;
  hint: string;
  items: ReadonlyArray<{ key: string; text: string }>;
  onViewAll: () => void;
}

function NotableSection({ title, hint, items, onViewAll }: NotableSectionProps) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onViewAll}
          className="text-xs text-foreground underline-offset-4 hover:underline"
        >
          View all
        </Button>
      </div>
      <ul className="mt-2 space-y-1">
        {items.slice(0, 5).map((item) => (
          <li key={item.key} className="text-sm text-foreground/90">
            • {item.text}
          </li>
        ))}
      </ul>
    </div>
  );
}
