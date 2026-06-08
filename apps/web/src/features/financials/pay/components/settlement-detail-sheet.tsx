'use client';

import { useState, useEffect } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import { showSuccess, showError } from '@sally/ui';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Label } from '@sally/ui/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  useApproveSettlement,
  useMarkSettlementPaid,
  useVoidSettlement,
  useRemoveDeduction,
  useUpdateNotes,
} from '../hooks/use-settlements';
import { settlementsApi } from '../api';
import { AddDeductionDialog } from './add-deduction-dialog';
import { useAccountingStatus, useSyncSettlementToAccounting } from '@/features/integrations/accounting/hooks';
import type { Settlement } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { CheckCircle, DollarSign, Ban, Plus, Trash2, Download, Eye, RefreshCw, MoreHorizontal } from 'lucide-react';
import { formatCents } from '@/shared/lib/utils/formatters';

import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { SettlementStatusBadge } from './settlement-status-badge';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { PdfPreviewDialog } from '@/features/fleet/documents/components/viewer';

const PAY_TYPE_LABELS: Record<string, string> = {
  PER_MILE: 'Per Mile',
  PERCENTAGE: 'Percentage',
  FLAT_RATE: 'Flat Rate',
  HYBRID: 'Hybrid',
};

function formatRoute(stops?: Array<{ stop?: { city: string; state: string } }>): string {
  if (!stops?.length) return '—';
  const origin = stops[0]?.stop;
  const dest = stops[stops.length - 1]?.stop;
  const oLabel = [origin?.city, origin?.state].filter(Boolean).join(', ') || 'N/A';
  const dLabel = [dest?.city, dest?.state].filter(Boolean).join(', ') || 'N/A';
  return `${oLabel} → ${dLabel}`;
}

interface SettlementDetailSheetProps {
  settlement: Settlement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettlementDetailSheet({ settlement, open, onOpenChange }: SettlementDetailSheetProps) {
  const { formatCalendarDate, formatTimestamp } = useFormatters();
  const sizing = useSheetSizing('settlement');
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [notesValue, setNotesValue] = useState(settlement.notes ?? '');
  const [, setPdfPreviewLoading] = useState(false);
  const [, setPdfDownloadLoading] = useState(false);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const approveSettlement = useApproveSettlement();
  const markPaid = useMarkSettlementPaid();
  const voidSettlement = useVoidSettlement();
  const removeDeduction = useRemoveDeduction();
  const updateNotes = useUpdateNotes();

  const { data: accountingStatus } = useAccountingStatus();
  const syncSettlement = useSyncSettlementToAccounting();

  const handleSyncToQB = () => {
    syncSettlement.mutate(settlement.settlementId);
  };

  const ps = settlement.driver?.payStructures?.[0] ?? null;

  // Sync notes when settlement prop changes (live sync)
  useEffect(() => {
    setNotesValue(settlement.notes ?? '');
  }, [settlement.notes]);

  const handleSaveNotes = () => {
    updateNotes.mutate({
      settlementId: settlement.settlementId,
      notes: notesValue,
    });
  };

  const handlePreviewPdf = async () => {
    setPdfPreviewLoading(true);
    try {
      const blobUrl = await settlementsApi.getPreviewBlobUrl(settlement.settlementId);
      setPdfPreviewUrl(blobUrl);
      setPdfPreviewOpen(true);
    } catch (error) {
      showError('Failed to preview PDF', extractErrorMessage(error));
    } finally {
      setPdfPreviewLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfDownloadLoading(true);
    try {
      await settlementsApi.downloadPdf(settlement.settlementId);
      showSuccess('PDF downloaded');
    } catch (error) {
      showError('Failed to download PDF', extractErrorMessage(error));
    } finally {
      setPdfDownloadLoading(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="w-full p-0 flex flex-col"
          pinnable
          resizable
          defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
        >
          {/* Sticky Header */}
          <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="settlement" /> : undefined}>
            <div className="flex items-center gap-3">
              <SheetTitle className="text-lg truncate">{settlement.settlementNumber}</SheetTitle>
              <SettlementStatusBadge status={settlement.status} />
            </div>
            <div className="text-sm text-muted-foreground">
              {settlement.driver?.name} &middot; {formatCalendarDate(settlement.periodStart, DISPLAY_FORMATS.FRIENDLY)}{' '}
              - {formatCalendarDate(settlement.periodEnd, DISPLAY_FORMATS.FRIENDLY)}
            </div>
            {ps && (
              <div className="text-xs text-muted-foreground">
                {PAY_TYPE_LABELS[ps.type] ?? ps.type}
                {ps.type === 'PER_MILE' &&
                  ps.ratePerMileCents != null &&
                  ` · $${(ps.ratePerMileCents / 100).toFixed(2)}/mi`}
                {ps.type === 'PERCENTAGE' && ps.percentage != null && ` · ${ps.percentage}%`}
                {ps.type === 'FLAT_RATE' &&
                  ps.flatRateCents != null &&
                  ` · $${(ps.flatRateCents / 100).toFixed(2)}/load`}
                {ps.type === 'HYBRID' &&
                  ` · $${((ps.hybridBaseCents ?? 0) / 100).toFixed(2)} + ${ps.hybridPercent ?? 0}%`}
              </div>
            )}
            <SheetDescription className="sr-only">
              Settlement details for {settlement.settlementNumber}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Earnings */}
              <div>
                <h3 className="font-semibold text-foreground mb-3">Earnings</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Load</TableHead>
                        <TableHead className="hidden md:table-cell">Route</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Miles</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Revenue</TableHead>
                        <TableHead className="text-right">Pay</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlement.lineItems?.map((item) => {
                        const itemLeg = (item as unknown as { leg?: { sequence: number } }).leg;
                        return (
                          <TableRow key={item.id}>
                            <TableCell className="text-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                {item.load?.loadNumber
                                  ? formatLoadLabel(item.load.loadNumber, item.load.referenceNumber)
                                  : `#${item.loadId}`}
                                {itemLeg && (
                                  <span className="inline-flex items-center bg-purple-500/10 text-purple-500 border border-purple-500/30 text-2xs px-1.5 py-0 rounded-full font-medium">
                                    {`LEG ${itemLeg.sequence}`}
                                  </span>
                                )}
                              </span>
                            </TableCell>
                            <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                              {formatRoute(item.load?.stops)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                              {item.miles?.toFixed(0) ?? '—'}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground hidden sm:table-cell">
                              {item.loadRevenueCents ? formatCents(item.loadRevenueCents) : '—'}
                            </TableCell>
                            <TableCell className="text-right font-medium text-foreground">
                              {formatCents(item.payAmountCents)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Earnings subtotal */}
                      <TableRow>
                        <TableCell colSpan={4} className="text-right font-semibold text-foreground">
                          Subtotal
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground">
                          {formatCents(settlement.grossPayCents)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Deductions */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">Deductions</h3>
                  {settlement.status === 'DRAFT' && (
                    <Button variant="outline" size="sm" onClick={() => setDeductionOpen(true)}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add
                    </Button>
                  )}
                </div>
                {settlement.deductions?.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        {settlement.status === 'DRAFT' && <TableHead className="w-10" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {settlement.deductions.map((d) => (
                        <TableRow key={d.id}>
                          <TableCell className="text-muted-foreground text-xs">{d.type.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-foreground">{d.description}</TableCell>
                          <TableCell className="text-right text-muted-foreground font-medium">
                            -{formatCents(d.amountCents)}
                          </TableCell>
                          {settlement.status === 'DRAFT' && (
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() =>
                                  removeDeduction.mutate({
                                    settlementId: settlement.settlementId,
                                    deductionId: d.id,
                                  })
                                }
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">No deductions</p>
                )}
              </div>

              <Separator />

              {/* Net Pay Summary */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-foreground">
                  <span>Gross Pay</span>
                  <span className="font-medium">{formatCents(settlement.grossPayCents)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Deductions</span>
                  <span>-{formatCents(settlement.deductionsCents)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold text-foreground text-base">
                  <span>Net Pay</span>
                  <span>{formatCents(settlement.netPayCents)}</span>
                </div>
              </div>

              <Separator />

              {/* QuickBooks Sync Status */}
              {(settlement.externalBillId || settlement.externalSyncedAt || settlement.externalSyncError) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-foreground mb-3 text-sm">QuickBooks Sync</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {settlement.externalBillId && (
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">QB Bill ID</span>
                          <p className="font-medium text-foreground mt-0.5 font-mono text-xs">
                            {settlement.externalBillId}
                          </p>
                        </div>
                      )}
                      {settlement.externalSyncedAt && (
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Last Synced</span>
                          <p className="font-medium text-foreground mt-0.5">
                            {formatTimestamp(settlement.externalSyncedAt)}
                          </p>
                        </div>
                      )}
                      {settlement.externalSyncError && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Sync Error</span>
                          <p className="text-critical text-sm mt-0.5 whitespace-pre-wrap">
                            {settlement.externalSyncError}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              <div>
                <Label htmlFor="settlement-notes" className="font-semibold text-foreground mb-2 block">
                  Notes
                </Label>
                {settlement.status === 'DRAFT' ? (
                  <div className="space-y-2">
                    <Textarea
                      id="settlement-notes"
                      value={notesValue}
                      onChange={(e) => setNotesValue(e.target.value)}
                      placeholder="Add internal notes..."
                      rows={3}
                    />
                    {notesValue !== (settlement.notes ?? '') && (
                      <Button size="sm" variant="outline" onClick={handleSaveNotes} loading={updateNotes.isPending}>
                        Save Notes
                      </Button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{settlement.notes || 'No notes'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            {/* Overflow menu (left) */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handlePreviewPdf}>
                  <Eye className="mr-2 h-4 w-4" />
                  Preview PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadPdf}>
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </DropdownMenuItem>
                {accountingStatus?.connected && settlement.status !== 'VOID' && (
                  <DropdownMenuItem onClick={handleSyncToQB} disabled={syncSettlement.isPending}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {settlement.externalSyncedAt ? 'Re-sync to QB' : 'Sync to QB'}
                  </DropdownMenuItem>
                )}
                {settlement.status !== 'VOID' && settlement.status !== 'PAID' && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setVoidConfirmOpen(true)}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Void
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            {/* Primary action (right) */}
            {settlement.status === 'DRAFT' && (
              <Button
                size="sm"
                onClick={() => approveSettlement.mutate(settlement.settlementId)}
                loading={approveSettlement.isPending}
              >
                <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                Approve
              </Button>
            )}
            {settlement.status === 'APPROVED' && (
              <Button size="sm" onClick={() => markPaid.mutate(settlement.settlementId)} loading={markPaid.isPending}>
                <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                Mark as Paid
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AddDeductionDialog settlementId={settlement.settlementId} open={deductionOpen} onOpenChange={setDeductionOpen} />

      <AlertDialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Settlement?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void settlement {settlement.settlementNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => voidSettlement.mutate(settlement.settlementId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Void Settlement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PdfPreviewDialog
        open={pdfPreviewOpen}
        onOpenChange={(next) => {
          setPdfPreviewOpen(next);
          if (!next && pdfPreviewUrl) {
            URL.revokeObjectURL(pdfPreviewUrl);
            setPdfPreviewUrl(null);
          }
        }}
        pdfUrl={pdfPreviewUrl}
        title={`Settlement ${settlement.settlementNumber}`}
        onDownload={handleDownloadPdf}
      />
    </>
  );
}
