'use client';

import { useMemo } from 'react';
import { Badge } from '@app/ui/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import type { DeveloperScopeEntry } from '../api';

export interface ScopesTableProps {
  rows: DeveloperScopeEntry[];
}

type HitlTier = DeveloperScopeEntry['hitlTier'];

const HITL_TIER_COPY: Record<HitlTier, string> = {
  none: 'Read-only',
  standard: 'Confirm each write',
  sensitive: 'PIN-confirm each call',
};

const HITL_TIER_VARIANT: Record<HitlTier, 'muted' | 'info' | 'caution' | 'critical'> = {
  none: 'muted',
  standard: 'info',
  sensitive: 'caution',
};

function domainOf(scope: string): string {
  return scope.split(':')[0] ?? scope;
}

export function ScopesTable({ rows }: ScopesTableProps) {
  const grouped = useMemo(() => {
    const byDomain = new Map<string, DeveloperScopeEntry[]>();
    for (const row of rows) {
      const domain = domainOf(row.scope);
      const list = byDomain.get(domain) ?? [];
      list.push(row);
      byDomain.set(domain, list);
    }
    return Array.from(byDomain.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-12 text-center">
        <p className="text-sm text-muted-foreground">No scopes registered.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {grouped.map(([domain, domainRows]) => (
        <section key={domain} aria-labelledby={`domain-${domain}`}>
          <h2 id={`domain-${domain}`} className="text-lg font-semibold text-foreground capitalize mb-3">
            {domain}
          </h2>
          <div className="rounded-md border border-border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[22%]">Scope</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead className="w-[18%]">HITL tier</TableHead>
                  <TableHead className="w-[28%]">Sample tools</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domainRows.map((row) => (
                  <TableRow key={row.scope}>
                    <TableCell className="align-top font-mono text-xs text-foreground">{row.scope}</TableCell>
                    <TableCell className="align-top text-sm text-muted-foreground">
                      <p className="text-foreground">{row.summary}</p>
                      <p className="mt-1 text-xs leading-relaxed">{row.grantsPlainEnglish}</p>
                    </TableCell>
                    <TableCell className="align-top">
                      <Badge variant={HITL_TIER_VARIANT[row.hitlTier]}>{HITL_TIER_COPY[row.hitlTier]}</Badge>
                    </TableCell>
                    <TableCell className="align-top text-xs">
                      {row.sampleTools.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="flex flex-wrap gap-1">
                          {row.sampleTools.map((tool) => (
                            <li
                              key={tool}
                              className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground"
                            >
                              {tool}
                            </li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}
    </div>
  );
}
