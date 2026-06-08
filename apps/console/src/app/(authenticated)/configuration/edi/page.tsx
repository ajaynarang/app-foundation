'use client';

import { useState, useCallback } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronLeft, ChevronRight, Plus, Sparkles, X } from 'lucide-react';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Switch } from '@app/ui/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@app/ui/components/ui/tabs';
import {
  useEdiPartners,
  useTogglePartnerStatus,
  useEdiRules,
  useToggleRuleStatus,
  useApproveRule,
  useDismissRule,
  useEdiMessages,
} from '@/features/edi/hooks';
import type {
  EdiPartner,
  EdiAutoAcceptRule,
  EdiMessageDirection,
  EdiMessageType,
  EdiMessageStatus,
} from '@/features/edi/types';
import type { ListMessagesParams } from '@/features/edi/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateString: string | null): string {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
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
// Status badges
// ---------------------------------------------------------------------------

function PartnerStatusBadge({ status }: { status: EdiPartner['status'] }) {
  if (status === 'ACTIVE') {
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

function RuleStatusBadge({ rule }: { rule: EdiAutoAcceptRule }) {
  if (rule.isSallySuggested && rule.status === 'SUGGESTED') {
    return (
      <Badge className="bg-purple-600 dark:bg-purple-700 text-white">
        <Sparkles className="h-3 w-3 mr-1" />
        Sally Suggested
      </Badge>
    );
  }
  if (rule.status === 'ACTIVE') {
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

function MessageStatusBadge({ status }: { status: EdiMessageStatus }) {
  const map: Record<EdiMessageStatus, { className: string; label: string }> = {
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
// Skeleton loaders
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
  const { data: partners, isLoading } = useEdiPartners();
  const toggleStatus = useTogglePartnerStatus();

  if (isLoading) {
    return <TableSkeleton cols={7} />;
  }

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
            <TableHead className="text-right">Messages</TableHead>
            <TableHead>Update Level</TableHead>
            <TableHead className="text-right">Tenders</TableHead>
            <TableHead>Last Activity</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {partners.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-medium text-foreground">{p.name}</TableCell>
              <TableCell className="font-mono text-sm text-muted-foreground">{p.isaId}</TableCell>
              <TableCell>
                <PartnerStatusBadge status={p.status} />
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{p.totalMessages.toLocaleString()}</TableCell>
              <TableCell className="text-muted-foreground">{p.updateLevel}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {p.tendersReceived}/{p.tendersAccepted}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatRelativeTime(p.lastActivityAt)}</TableCell>
              <TableCell>
                <Switch
                  checked={p.status === 'ACTIVE'}
                  onCheckedChange={(checked) => toggleStatus.mutate({ partnerId: p.id, isActive: checked })}
                  aria-label={`Toggle ${p.name} active`}
                />
              </TableCell>
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
  const { data: rules, isLoading } = useEdiRules();
  const toggleStatus = useToggleRuleStatus();
  const approveRule = useApproveRule();
  const dismissRule = useDismissRule();

  if (isLoading) {
    return <TableSkeleton cols={6} />;
  }

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
            <TableHead>Conditions</TableHead>
            <TableHead className="text-right">Matches</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created By</TableHead>
            <TableHead className="w-32" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium text-foreground">{r.name}</TableCell>
              <TableCell className="text-muted-foreground">{r.partnerName ?? 'All'}</TableCell>
              <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">
                {r.conditionsSummary}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">{r.matchCount.toLocaleString()}</TableCell>
              <TableCell>
                <RuleStatusBadge rule={r} />
              </TableCell>
              <TableCell className="text-muted-foreground">{r.createdBy ?? 'Sally'}</TableCell>
              <TableCell>
                {r.isSallySuggested && r.status === 'SUGGESTED' ? (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={approveRule.isPending}
                      onClick={() => approveRule.mutate(r.id)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={dismissRule.isPending}
                      onClick={() => dismissRule.mutate(r.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Switch
                    checked={r.status === 'ACTIVE'}
                    onCheckedChange={(checked) => toggleStatus.mutate({ ruleId: r.id, isActive: checked })}
                    aria-label={`Toggle ${r.name} active`}
                  />
                )}
              </TableCell>
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
  const [filters, setFilters] = useState<ListMessagesParams>({
    limit: PAGE_SIZE,
    offset: 0,
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useEdiMessages(filters);

  const setFilter = useCallback((key: keyof ListMessagesParams, value: string | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      offset: 0,
    }));
  }, []);

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
  const currentPage = data ? Math.floor((data.offset ?? 0) / PAGE_SIZE) + 1 : 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.direction ?? 'ALL'}
          onValueChange={(v) => setFilter('direction', v === 'ALL' ? undefined : (v as EdiMessageDirection))}
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
          onValueChange={(v) => setFilter('transactionType', v === 'ALL' ? undefined : (v as EdiMessageType))}
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

        <Select
          value={filters.status ?? 'ALL'}
          onValueChange={(v) => setFilter('status', v === 'ALL' ? undefined : (v as EdiMessageStatus))}
        >
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
            <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton cols={6} />
      ) : !data || data.data.length === 0 ? (
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
              {data.data.map((msg) => {
                const isExpanded = expandedId === msg.id;
                return (
                  <>
                    <TableRow
                      key={msg.id}
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                    >
                      <TableCell>
                        {msg.direction === 'INBOUND' ? (
                          <ArrowDownLeft className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4 text-green-500 dark:text-green-400" />
                        )}
                      </TableCell>
                      <TableCell className="font-mono font-medium text-foreground">{msg.transactionType}</TableCell>
                      <TableCell className="text-muted-foreground">{msg.partnerName}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {msg.referenceNumber ?? '-'}
                      </TableCell>
                      <TableCell>
                        <MessageStatusBadge status={msg.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatTimestamp(msg.createdAt)}</TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow key={`${msg.id}-detail`}>
                        <TableCell colSpan={6} className="bg-muted/50 p-4">
                          <div className="space-y-2 text-sm">
                            {msg.errorMessage && (
                              <div>
                                <span className="font-medium text-red-600 dark:text-red-400">Error: </span>
                                <span className="text-muted-foreground">{msg.errorMessage}</span>
                              </div>
                            )}
                            {msg.parsedData && (
                              <div>
                                <span className="font-medium text-foreground">Parsed Data:</span>
                                <pre className="mt-1 rounded-md bg-background p-3 text-xs text-muted-foreground overflow-auto max-h-48 border border-border">
                                  {JSON.stringify(msg.parsedData, null, 2)}
                                </pre>
                              </div>
                            )}
                            {!msg.errorMessage && !msg.parsedData && (
                              <p className="text-muted-foreground">No additional details available</p>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(data.offset ?? 0) + 1}–{Math.min((data.offset ?? 0) + PAGE_SIZE, data.total)} of{' '}
            {data.total.toLocaleString()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  offset: Math.max(0, (prev.offset ?? 0) - PAGE_SIZE),
                }))
              }
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
              onClick={() =>
                setFilters((prev) => ({
                  ...prev,
                  offset: (prev.offset ?? 0) + PAGE_SIZE,
                }))
              }
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
        <p className="text-sm text-muted-foreground">
          Manage trading partners, auto-accept rules, and review EDI message history.
        </p>
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
          <div>
            <p className="text-sm text-muted-foreground">Audit log of all EDI messages sent and received.</p>
          </div>
          <MessagesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
