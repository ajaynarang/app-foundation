'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { AgentScope } from '@app/shared-types';
import { cn } from '@app/ui';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@app/ui/components/ui/collapsible';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import type { ScopeReferenceEntry } from '../api';
import { useScopeReference } from '../hooks/use-scope-reference';
import { ListErrorState } from '@/shared/components/page-chrome';
import { groupScopesByDomain } from '../utils/scope-copy';
import { ScopeChip } from './ScopeChip';

type HitlTier = ScopeReferenceEntry['hitlTier'];

const HITL_TIER_LABEL: Record<HitlTier, string> = {
  none: 'Read-only',
  standard: 'Confirm each write',
  sensitive: 'Sensitive: stricter confirmation',
};

const HITL_TIER_VARIANT: Record<HitlTier, 'muted' | 'info' | 'caution'> = {
  none: 'muted',
  standard: 'info',
  sensitive: 'caution',
};

function ScopeReferenceRow({ entry }: { entry: ScopeReferenceEntry }) {
  return (
    <li className="space-y-1.5 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <ScopeChip scope={entry.scope} noTooltip />
        <Badge variant={HITL_TIER_VARIANT[entry.hitlTier]}>{HITL_TIER_LABEL[entry.hitlTier]}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{entry.grantsPlainEnglish}</p>
      {entry.sampleTools.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">Tools:</span>{' '}
          <span className="font-mono">{entry.sampleTools.join(', ')}</span>
        </p>
      )}
    </li>
  );
}

function ScopeReferenceList({ entries }: { entries: ScopeReferenceEntry[] }) {
  const grouped = useMemo(() => {
    const byScope = new Map<AgentScope, ScopeReferenceEntry>(entries.map((entry) => [entry.scope, entry]));
    const domains = groupScopesByDomain(entries.map((entry) => entry.scope));
    return Object.keys(domains)
      .sort()
      .map((domain) => ({ domain, rows: domains[domain].map((scope) => byScope.get(scope)!) }));
  }, [entries]);

  if (entries.length === 0) {
    return <p className="px-3 py-4 text-xs text-muted-foreground">No scopes registered.</p>;
  }

  return (
    <div className="max-h-80 divide-y divide-border overflow-y-auto">
      {grouped.map(({ domain, rows }) => (
        <section key={domain} aria-label={`${domain} scopes`}>
          <h4 className="bg-muted/50 px-3 py-1.5 text-xs font-medium capitalize text-foreground">{domain}</h4>
          <ul className="divide-y divide-border">
            {rows.map((entry) => (
              <ScopeReferenceRow key={entry.scope} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/**
 * "What each scope grants", shown where scopes are chosen. Collapsed by
 * default; the list is read from the backend scope registry the first time
 * it is opened, so the sample tools are the ones that exist today.
 */
export function ScopesReference() {
  const [isOpen, setIsOpen] = useState(false);
  const reference = useScopeReference({ enabled: isOpen });
  const { data: entries, isLoading, isError, error } = reference;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs text-muted-foreground">
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', isOpen && 'rotate-90')} aria-hidden />
          What each scope grants
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border border-border">
        {isLoading && (
          <div className="space-y-2 p-3" aria-label="Loading scopes">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {isError && (
          <ListErrorState
            className="border-0"
            title="Couldn't load the scope reference."
            error={error}
            onRetry={() => void reference.refetch()}
            isRetrying={reference.isRefetching}
          />
        )}
        {entries && <ScopeReferenceList entries={entries} />}
      </CollapsibleContent>
    </Collapsible>
  );
}
