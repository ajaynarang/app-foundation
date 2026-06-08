'use client';

import { useState, useCallback, Fragment } from 'react';
import { formatRelativeTime } from '@/shared/lib/utils/formatters';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@sally/ui/components/ui/tabs';
import { useTradingPartners, useAutoAcceptRules, useEDIMessages } from '@/features/edi';
import type { EDITradingPartner, EDIAutoAcceptRule } from '@/features/edi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTimeOrNever(dateString: string | null): string {
  if (!dateString) return 'Never';
  return formatRelativeTime(dateString);
}

function formatTimestamp(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function PartnerStatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white">
        Active
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="text-muted-foreground">
      Inactive
    </Badge>
  );
}

function MessageStatusBadge({ status }: { status: string }) {
  const map: Record<string, { className: string; label: string }> = {
    SENT: { className: 'bg-green-600 dark:bg-green-700 text-white', label: 'Sent' },
    RECEIVED: { className: 'bg-blue-600 dark:bg-blue-700 text-white', label: 'Received' },
    PROCESSING: { className: 'bg-amber-600 dark:bg-amber-700 text-white', label: 'Processing' },
    ACCEPTED: { className: 'bg-green-600 dark:bg-green-700 text-white', label: 'Accepted' },
    REJECTED: { className: 'bg-red-600 dark:bg-red-700 text-white', label: 'Rejected' },
    FAILED: { className: 'bg-red-600 dark:bg-red-700 text-white', label: 'Failed' },
    ACKNOWLEDGED: { className: 'bg-blue-600 dark:bg-blue-700 text-white', label: 'Acknowledged' },
  };
  const info = map[status] ?? { className: '', label: status };
  return <Badge className={info.className}>{info.label}</Badge>;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function TableSkeleton({ rows = 5, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: cols }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className="h-4 w-20" />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, ri) => (
          <TableRow key={ri}>
            {Array.from({ length: cols }).map((_, ci) => (
              <TableCell key={ci}>
                <Skeleton className="h-4 w-full" />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Partners Tab
// ---------------------------------------------------------------------------

function PartnersTab() {
  const { data: partners, isLoading } = useTradingPartners();

  if (isLoading) return <TableSkeleton cols={5} />;

  if (!partners || partners.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No trading partners configured</p>
          <Button variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Add Partner
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>ISA ID</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Tenders</TableHead>
            <TableHead>Last Activity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((p: EDITradingPartner) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium text-foreground">{p.name}</TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">{p.isaId}</TableCell>
              <TableCell>
                <PartnerStatusBadge isActive={p.isActive} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {p.tendersReceived}/{p.tendersAccepted}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatRelativeTimeOrNever(p.lastMessageAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rules Tab
// ---------------------------------------------------------------------------

function RulesTab() {
  const { data: rules, isLoading } = useAutoAcceptRules();

  if (isLoading) return <TableSkeleton cols={5} />;

  if (!rules || rules.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No auto-accept rules configured</p>
          <Button variant="outline" className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Create Rule
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Partner</TableHead>
            <TableHead className="text-right">Matches</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r: EDIAutoAcceptRule) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium text-foreground">{r.name}</TableCell>
              <TableCell className="text-muted-foreground">{r.tradingPartner?.name ?? 'All'}</TableCell>
              <TableCell className="text-right text-muted-foreground">{r.matchCount.toLocaleString()}</TableCell>
              <TableCell>
                {r.isActive ? (
                  <Badge variant="default" className="bg-green-600 dark:bg-green-700 text-white">
                    Active
                  </Badge>
                ) : r.suggestedFromPattern && !r.approvedAt ? (
                  <Badge className="bg-purple-600 dark:bg-purple-700 text-white">Suggested</Badge>
                ) : (
                  <Badge variant="muted" className="text-muted-foreground">
                    Inactive
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">{r.createdBy ?? 'Sally'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Messages Tab
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

function MessagesTab() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const queryParams = { ...filters, limit: String(PAGE_SIZE), offset: String(offset) };
  const { data, isLoading } = useEDIMessages(queryParams);

  const setFilter = useCallback((key: string, value: string | undefined) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setOffset(0);
  }, []);

  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const messages = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.direction ?? 'ALL'}
          onValueChange={(v) => setFilter('direction', v === 'ALL' ? undefined : v)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Direction" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All directions</SelectItem>
            <SelectItem value="INBOUND">Inbound</SelectItem>
            <SelectItem value="OUTBOUND">Outbound</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.transactionType ?? 'ALL'}
          onValueChange={(v) => setFilter('transactionType', v === 'ALL' ? undefined : v)}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            <SelectItem value="204">204</SelectItem>
            <SelectItem value="210">210</SelectItem>
            <SelectItem value="214">214</SelectItem>
            <SelectItem value="990">990</SelectItem>
            <SelectItem value="997">997</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filters.status ?? 'ALL'} onValueChange={(v) => setFilter('status', v === 'ALL' ? undefined : v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="SENT">Sent</SelectItem>
            <SelectItem value="RECEIVED">Received</SelectItem>
            <SelectItem value="PROCESSING">Processing</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No messages found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Type</TableHead>
                <TableHead>Partner</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {messages.map((msg: any) => {
                const isExpanded = expandedId === String(msg.id);
                return (
                  <Fragment key={msg.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => setExpandedId(isExpanded ? null : String(msg.id))}
                    >
                      <TableCell>
                        {msg.direction === 'INBOUND' ? (
                          <ArrowDownLeft className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-green-500 dark:text-green-400" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-medium text-foreground">
                        {msg.messageType || msg.transactionType || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{msg.tradingPartner?.name ?? '-'}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {msg.referenceNumber ?? '-'}
                      </TableCell>
                      <TableCell>
                        <MessageStatusBadge status={msg.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatTimestamp(msg.createdAt)}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/50 p-4">
                          <div className="space-y-2 text-sm">
                            {msg.parsedData ? (
                              <div>
                                <span className="font-medium text-foreground">Parsed Data:</span>
                                <pre className="mt-1 rounded-md bg-background p-3 text-xs text-muted-foreground overflow-auto max-h-48 border border-border">
                                  {JSON.stringify(msg.parsedData, null, 2)}
                                </pre>
                              </div>
                            ) : (
                              <p className="text-muted-foreground">No additional details available</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {offset + 1}--{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function EdiSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">EDI Settings</h2>
        <p className="text-sm text-muted-foreground">Trading partners, auto-accept rules, and message history</p>
      </div>

      <Tabs defaultValue="partners" className="space-y-4">
        <TabsList>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="messages">Messages</TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Configure EDI trading partners and their connection settings.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Partner
            </Button>
          </div>
          <PartnersTab />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Auto-accept rules for incoming load tenders. Sally may suggest rules based on your patterns.
            </p>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Rule
            </Button>
          </div>
          <RulesTab />
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <p className="text-sm text-muted-foreground">Audit log of all EDI messages sent and received.</p>
          <MessagesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
