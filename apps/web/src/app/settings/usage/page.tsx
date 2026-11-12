'use client';

import { useState } from 'react';
import type { BillingInvoiceStatus, WalletTransactionType } from '@app/shared-types';
import { Card, CardContent } from '@app/ui/components/ui/card';
import { StatusBadge } from '@app/ui/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@app/ui/components/ui/table';
import {
  useBillingInvoices,
  useWalletTransactions,
  useDownloadBillingInvoice,
} from '@/features/billing/hooks/use-billing';
import { formatCents } from '@appshore/web-core/shared/lib/utils/formatters';
import {
  INVOICE_STATUS_VARIANTS,
  TRANSACTION_TYPE_VARIANTS,
  variantOf,
  variantOptions,
} from '@/features/billing/constants';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { formatTimestampDate, DISPLAY_FORMATS } from '@appshore/web-core/shared/lib/utils/date-utils';
import { cn } from '@app/ui';
import {
  FilterSelect,
  ListErrorState,
  ListFilterRow,
  ListFooter,
  PageEmptyState,
  PageHeader,
  PageLoadingSkeleton,
  PageSection,
  RowActions,
} from '@/shared/components/page-chrome';

const INVOICE_STATUS_OPTIONS = variantOptions(INVOICE_STATUS_VARIANTS);
const TRANSACTION_TYPE_OPTIONS = variantOptions(TRANSACTION_TYPE_VARIANTS);

export default function UsagePage() {
  const [invoiceStatus, setInvoiceStatus] = useState<BillingInvoiceStatus | undefined>();
  const [txType, setTxType] = useState<WalletTransactionType | undefined>();

  const invoices = useBillingInvoices({ status: invoiceStatus, limit: 10 });
  const transactions = useWalletTransactions({ type: txType, limit: 10 });
  const { mutate: downloadInvoice, isPending: downloadPending } = useDownloadBillingInvoice();

  const { timezone } = useFormatters();

  return (
    <div className="space-y-8">
      <PageHeader title="Usage & Invoices" subtitle="What you've used and what it costs" />

      <PageSection title="Invoice history">
        <ListFilterRow>
          <FilterSelect
            label="Invoice status"
            allLabel="All statuses"
            options={INVOICE_STATUS_OPTIONS}
            value={invoiceStatus}
            onChange={setInvoiceStatus}
          />
        </ListFilterRow>

        {invoices.isLoading ? (
          <PageLoadingSkeleton variant="table" rows={5} />
        ) : invoices.isError ? (
          <ListErrorState
            title="Couldn't load your invoices."
            error={invoices.error}
            onRetry={() => void invoices.refetch()}
            isRetrying={invoices.isRefetching}
          />
        ) : invoices.items.length === 0 ? (
          <PageEmptyState title="No invoices yet" description="Invoices show here once you are billed." />
        ) : (
          <>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[1%]">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.items.map((inv) => {
                      const status = variantOf(INVOICE_STATUS_VARIANTS, inv.status);
                      const label = inv.providerInvoiceId ? `#${inv.providerInvoiceId.slice(-8)}` : inv.id.slice(0, 8);
                      const hostedUrl = inv.hostedInvoiceUrl;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            {formatTimestampDate(inv.createdAt, timezone, DISPLAY_FORMATS.FRIENDLY)}
                          </TableCell>
                          <TableCell className="text-sm text-foreground font-mono">{label}</TableCell>
                          <TableCell className="text-right text-sm font-medium text-foreground tabular-nums">
                            {formatCents(inv.amountDueCents)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-right">
                            <RowActions
                              primary={
                                inv.pdfUrl
                                  ? {
                                      label: 'Download',
                                      ariaLabel: `Download invoice ${label}`,
                                      onClick: () => downloadInvoice(inv.id),
                                      loading: downloadPending,
                                    }
                                  : undefined
                              }
                              items={
                                hostedUrl
                                  ? [
                                      {
                                        label: 'View online',
                                        ariaLabel: `View invoice ${label} online`,
                                        onSelect: () => window.open(hostedUrl, '_blank', 'noopener,noreferrer'),
                                      },
                                    ]
                                  : undefined
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <ListFooter
              shown={invoices.items.length}
              total={invoices.total}
              hasMore={invoices.hasMore}
              onLoadMore={invoices.loadMore}
              isLoadingMore={invoices.isLoadingMore}
              loadMoreFailed={invoices.isLoadMoreError}
            />
          </>
        )}
      </PageSection>

      <PageSection title="Wallet transactions">
        <ListFilterRow>
          <FilterSelect
            label="Transaction type"
            allLabel="All types"
            options={TRANSACTION_TYPE_OPTIONS}
            value={txType}
            onChange={setTxType}
          />
        </ListFilterRow>

        {transactions.isLoading ? (
          <PageLoadingSkeleton variant="table" rows={5} />
        ) : transactions.isError ? (
          <ListErrorState
            title="Couldn't load your wallet transactions."
            error={transactions.error}
            onRetry={() => void transactions.refetch()}
            isRetrying={transactions.isRefetching}
          />
        ) : transactions.items.length === 0 ? (
          <PageEmptyState title="No transactions yet" description="Top-ups and charges to your wallet show here." />
        ) : (
          <>
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
                    {transactions.items.map((tx) => {
                      const type = variantOf(TRANSACTION_TYPE_VARIANTS, tx.type);
                      return (
                        <TableRow key={tx.id}>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            {formatTimestampDate(tx.createdAt, timezone, DISPLAY_FORMATS.FRIENDLY)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge tone={type.tone}>{type.label}</StatusBadge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {tx.description}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'text-right text-sm font-medium tabular-nums',
                              tx.amountCents >= 0 ? 'text-success-text' : 'text-critical-text',
                            )}
                          >
                            {tx.amountCents >= 0 ? '+' : ''}
                            {formatCents(tx.amountCents)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                            {formatCents(tx.balanceAfterCents)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <ListFooter
              shown={transactions.items.length}
              total={transactions.total}
              hasMore={transactions.hasMore}
              onLoadMore={transactions.loadMore}
              isLoadingMore={transactions.isLoadingMore}
              loadMoreFailed={transactions.isLoadMoreError}
            />
          </>
        )}
      </PageSection>
    </div>
  );
}
