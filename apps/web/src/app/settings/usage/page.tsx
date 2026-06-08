'use client';

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { Badge } from '@app/ui/components/ui/badge';
import { Button } from '@app/ui/components/ui/button';
import { Skeleton } from '@app/ui/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@app/ui/components/ui/select';
import {
  useBillingInvoices,
  useWalletTransactions,
  useDownloadBillingInvoice,
} from '@/features/billing/hooks/use-billing';
import { formatCents } from '@/shared/lib/utils/formatters';
import {
  getInvoiceStatusVariant,
  getTransactionTypeVariant,
  formatTransactionType,
  formatInvoiceStatus,
} from '@/features/billing/utils';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { formatTimestampDate, DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { cn } from '@app/ui';

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------
function UsageSkeleton() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usage & Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">What you&apos;ve used and what it costs</p>
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function UsagePage() {
  const [invoiceStatus, setInvoiceStatus] = useState<string | undefined>();
  const [invoiceCursor, setInvoiceCursor] = useState<string | undefined>();
  const [txType, setTxType] = useState<string | undefined>();
  const [txCursor, setTxCursor] = useState<string | undefined>();

  const { data: invoiceData, isLoading: invoicesLoading } = useBillingInvoices({
    status: invoiceStatus,
    cursor: invoiceCursor,
    limit: 10,
  });
  const { data: txData, isLoading: txLoading } = useWalletTransactions({
    type: txType,
    cursor: txCursor,
    limit: 10,
  });
  const { mutate: downloadInvoice, isPending: downloadPending } = useDownloadBillingInvoice();

  const { timezone } = useFormatters();

  const isLoading = invoicesLoading || txLoading;

  if (isLoading) {
    return <UsageSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Usage & Invoices</h1>
        <p className="text-sm text-muted-foreground mt-1">What you&apos;ve used and what it costs</p>
      </div>

      {/* Section 1: Invoice History */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Invoice History</h2>

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <Select
            value={invoiceStatus ?? 'all'}
            onValueChange={(v) => {
              setInvoiceStatus(v === 'all' ? undefined : v);
              setInvoiceCursor(undefined);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="PAID">Paid</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="VOID">Void</SelectItem>
              <SelectItem value="UNCOLLECTIBLE">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!invoiceData?.items || invoiceData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      <FileText className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      No invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  invoiceData.items.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatTimestampDate(inv.createdAt, timezone, DISPLAY_FORMATS.FRIENDLY)}
                      </TableCell>
                      <TableCell className="text-sm text-foreground font-mono">
                        {inv.providerInvoiceId ? `#${inv.providerInvoiceId.slice(-8)}` : inv.id.slice(0, 8)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-foreground tabular-nums">
                        {formatCents(inv.amountDueCents)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getInvoiceStatusVariant(inv.status)} className="text-2xs">
                          {formatInvoiceStatus(inv.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {inv.pdfUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadInvoice(inv.id)}
                              disabled={downloadPending}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {inv.hostedInvoiceUrl && (
                            <a href={inv.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm">
                                View
                              </Button>
                            </a>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {invoiceData && invoiceData.items.length > 0 && invoiceData.hasMore && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!invoiceData.hasMore}
              onClick={() => setInvoiceCursor(invoiceData.nextCursor)}
            >
              Load More
            </Button>
          </div>
        )}
      </section>

      {/* Section 3: Wallet Transaction Log */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Wallet Transactions</h2>

        {/* Type filter */}
        <div className="flex items-center gap-2">
          <Select
            value={txType ?? 'all'}
            onValueChange={(v) => {
              setTxType(v === 'all' ? undefined : v);
              setTxCursor(undefined);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="TOP_UP">Top Up</SelectItem>
              <SelectItem value="OVERAGE_DEDUCTION">Overage</SelectItem>
              <SelectItem value="ADMIN_CREDIT">Credit</SelectItem>
              <SelectItem value="REFUND">Refund</SelectItem>
              <SelectItem value="AUTO_RELOAD">Auto-Reload</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!txData?.items || txData.items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                      No transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  txData.items.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">
                        {formatTimestampDate(tx.createdAt, timezone, DISPLAY_FORMATS.FRIENDLY)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTransactionTypeVariant(tx.type)} className="text-2xs">
                          {formatTransactionType(tx.type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {tx.description}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right text-sm font-medium tabular-nums',
                          tx.amountCents >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400',
                        )}
                      >
                        {tx.amountCents >= 0 ? '+' : ''}
                        {formatCents(tx.amountCents)}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                        {formatCents(tx.balanceAfterCents)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {txData && txData.items.length > 0 && txData.hasMore && (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!txData.hasMore}
              onClick={() => setTxCursor(txData.nextCursor)}
            >
              Load More
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
