'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import { Button } from '@sally/ui/components/ui/button';
import { Separator } from '@sally/ui/components/ui/separator';
import { Badge } from '@sally/ui/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import { Plus, Trash2, CheckCircle, Receipt, Undo2, MoreHorizontal } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Label } from '@sally/ui/components/ui/label';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { BillingReadinessSection } from './billing-readiness-section';
import { OverrideDialog } from './override-dialog';
import { DocumentUploadDialog } from '@/features/fleet/documents/components/DocumentUploadDialog';
import { DocumentViewerDialog } from '@/features/fleet/documents/components/viewer';
import { useLoadCharges, useRemoveCharge } from '@/features/fleet/loads/hooks/use-loads';
import { useApproveForBilling, useBillingReadiness, useApproveWithOverride, useSendBack } from '../hooks/use-close-out';
import { useGenerateInvoice } from '@/features/financials/billing';
import { showSuccess } from '@sally/ui';
import { formatCents } from '@/shared/lib/utils/formatters';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { AddChargeDialog } from './add-charge-dialog';
import type { CloseOutLoad } from '../types';

interface Props {
  load: CloseOutLoad | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CloseOutReviewSheet({ load, open, onOpenChange }: Props) {
  const { formatTimestamp } = useFormatters();
  const sizing = useSheetSizing('close-out');
  const queryClient = useQueryClient();
  const [addChargeOpen, setAddChargeOpen] = useState(false);
  const [localBillingStatus, setLocalBillingStatus] = useState<string | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [preselectedType, setPreselectedType] = useState<string | undefined>();
  const [preselectedStopId, setPreselectedStopId] = useState<number | null>(null);
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDocId, setViewerDocId] = useState<number | undefined>();

  // Sync local status when load changes (e.g., sheet opens with new load)
  useEffect(() => {
    setLocalBillingStatus(load?.billingStatus ?? null);
  }, [load?.loadNumber, load?.billingStatus]);

  const loadIdStr = load?.loadNumber ?? '';
  const { data: charges, isLoading: chargesLoading } = useLoadCharges(loadIdStr);
  const {
    data: readiness,
    isLoading: readinessLoading,
    isFetching: readinessRefetching,
    refetch: refetchReadiness,
  } = useBillingReadiness(loadIdStr || null);
  const removeCharge = useRemoveCharge();
  const approveForBilling = useApproveForBilling();
  const approveWithOverride = useApproveWithOverride();
  const generateInvoice = useGenerateInvoice();
  const sendBack = useSendBack();

  const isApproved = localBillingStatus === 'APPROVED';
  const canApprove = readiness?.readyToApprove ?? false;
  const canOverride = !canApprove && (readiness?.overrideAllowed ?? false);
  const chargeTotalCents =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    charges?.reduce((sum: number, c: any) => sum + c.totalCents, 0) ?? 0;

  // Stable ref for keyboard shortcut handler
  const canApproveRef = useRef(false);
  canApproveRef.current = !isApproved && canApprove && !!load && !approveForBilling.isPending;

  const handleApprove = useCallback(() => {
    if (!load) return;
    approveForBilling.mutate(load.loadNumber, {
      onSuccess: () => {
        setLocalBillingStatus('APPROVED');
        showSuccess('Load approved for billing');
      },
    });
  }, [load, approveForBilling]);

  const [approveAndInvoicePending, setApproveAndInvoicePending] = useState(false);
  const handleApproveAndInvoice = useCallback(() => {
    if (!load) return;
    setApproveAndInvoicePending(true);
    approveForBilling.mutate(load.loadNumber, {
      onSuccess: () => {
        setLocalBillingStatus('APPROVED');
        generateInvoice.mutate(
          { loadId: load.loadNumber },
          {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onSuccess: (invoice: any) => {
              showSuccess(`Approved & invoiced — ${invoice.invoiceNumber ?? 'Invoice created'}`);
              setApproveAndInvoicePending(false);
              onOpenChange(false);
            },
            onError: () => setApproveAndInvoicePending(false),
          },
        );
      },
      onError: () => setApproveAndInvoicePending(false),
    });
  }, [load, approveForBilling, generateInvoice, onOpenChange]);

  // Keyboard shortcut: Cmd+Enter to approve & invoice (primary CTA)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (canApproveRef.current) handleApproveAndInvoice();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, handleApproveAndInvoice]);

  if (!load) return null;

  const handleGenerateInvoice = () => {
    generateInvoice.mutate(
      { loadId: load.loadNumber },
      {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSuccess: (invoice: any) => {
          showSuccess(`Invoice ${invoice.invoiceNumber ?? 'created'}`);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          className="w-full p-0 flex flex-col"
          onInteractOutside={(e) => e.preventDefault()}
          pinnable
          resizable
          defaultPinned
          defaultWidth={sizeModeToPixels(sizing.effectiveSize)}
        >
          {/* Sticky Header */}
          <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="close-out" /> : undefined}>
            <div className="flex items-center gap-3">
              <SheetTitle className="text-lg truncate">
                {formatLoadLabel(load.loadNumber, load.referenceNumber)}
              </SheetTitle>
              <Badge variant="outline">{load.billingStatus?.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="text-sm text-muted-foreground">
              {load.customerName}
              {load.driverName && <> &middot; {load.driverName}</>}
              {load.vehicleNumber && <> &middot; {load.vehicleNumber}</>}
            </div>
            <div className="text-sm text-muted-foreground">
              {load.originCity && load.destinationCity
                ? `${load.originCity}, ${load.originState} → ${load.destinationCity}, ${load.destinationState}`
                : '—'}
              {load.deliveredAt && (
                <> &middot; Delivered {formatTimestamp(load.deliveredAt, DISPLAY_FORMATS.FRIENDLY)}</>
              )}
            </div>
            <SheetDescription className="sr-only">Close-out review for {load.loadNumber}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Billing Readiness Section */}
              <BillingReadinessSection
                readiness={readiness}
                loading={readinessLoading}
                refreshing={readinessRefetching && !readinessLoading}
                onRefresh={() => {
                  refetchReadiness().then(() => {
                    queryClient.invalidateQueries({ queryKey: ['close-out', 'list'] });
                    queryClient.invalidateQueries({ queryKey: ['close-out', 'summary'] });
                  });
                }}
                onUploadClick={(docType, stopId) => {
                  setPreselectedType(docType);
                  setPreselectedStopId(stopId ?? null);
                  setUploadOpen(true);
                }}
                onViewDoc={(documentId) => {
                  setViewerDocId(documentId);
                  setViewerOpen(true);
                }}
              />

              <Separator />

              {/* Charges Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-foreground">Charges</h3>
                  {!isApproved && (
                    <Button variant="outline" size="sm" onClick={() => setAddChargeOpen(true)}>
                      <Plus className="mr-1 h-3 w-3" />
                      Add Charge
                    </Button>
                  )}
                </div>

                {chargesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </div>
                ) : !charges?.length ? (
                  <p className="text-sm text-muted-foreground">No charges</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Type</TableHead>
                        <TableHead className="text-xs">Description</TableHead>
                        <TableHead className="text-xs text-right">Amount</TableHead>
                        {!isApproved && <TableHead className="text-xs w-8" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {charges.map((charge: any) => (
                        <TableRow key={charge.id}>
                          <TableCell>
                            <Badge variant="outline" className="text-2xs">
                              {(charge.chargeType ?? '')
                                .replace(/_/g, ' ')
                                .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                            </Badge>
                            {charge.chargeType === 'linehaul' && (
                              <span className="text-2xs text-muted-foreground ml-1">(auto)</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-foreground">{charge.description}</TableCell>
                          <TableCell className="text-xs text-foreground text-right">
                            {formatCents(charge.totalCents)}
                          </TableCell>
                          {!isApproved && (
                            <TableCell>
                              {charge.chargeType !== 'linehaul' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() =>
                                    removeCharge.mutate({
                                      loadId: loadIdStr,
                                      chargeId: charge.id,
                                    })
                                  }
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={2} className="text-sm font-semibold text-foreground">
                          Total
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-foreground text-right">
                          {formatCents(chargeTotalCents)}
                        </TableCell>
                        {!isApproved && <TableCell />}
                      </TableRow>
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            {isApproved ? (
              <>
                {/* Overflow (left) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onClick={() => {
                        setSendBackOpen(true);
                        setSendBackReason('');
                      }}
                    >
                      <Undo2 className="mr-2 h-4 w-4" />
                      Send Back
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1" />
                {/* Primary (right) */}
                <Button size="sm" onClick={handleGenerateInvoice} loading={generateInvoice.isPending}>
                  <Receipt className="mr-1.5 h-3.5 w-3.5" />
                  Generate Invoice
                </Button>
              </>
            ) : (
              <>
                {/* Overflow (left) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={handleApprove} disabled={!canApprove || approveForBilling.isPending}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve Only
                    </DropdownMenuItem>
                    {canOverride && (
                      <DropdownMenuItem onClick={() => setOverrideOpen(true)}>Override & Approve</DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1" />
                {/* Primary (right) */}
                <Button
                  size="sm"
                  onClick={handleApproveAndInvoice}
                  loading={approveAndInvoicePending}
                  disabled={!canApprove}
                  title={!canApprove ? 'All required items must be met' : undefined}
                >
                  <Receipt className="mr-1.5 h-3.5 w-3.5" />
                  Approve & Invoice
                </Button>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AddChargeDialog loadId={loadIdStr} open={addChargeOpen} onOpenChange={setAddChargeOpen} />

      <OverrideDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        missingItems={readiness?.items.filter((i) => i.enforcement !== 'recommended' && i.status !== 'satisfied') ?? []}
        onConfirm={(reason) => {
          approveWithOverride.mutate(
            { loadId: load.loadNumber, reason },
            {
              onSuccess: () => {
                setOverrideOpen(false);
                setLocalBillingStatus('APPROVED');
              },
            },
          );
        }}
        isPending={approveWithOverride.isPending}
      />

      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={(next) => {
          setUploadOpen(next);
          if (!next) {
            queryClient.invalidateQueries({ queryKey: ['close-out', 'readiness'] });
          }
        }}
        entityType="load"
        entityId={load?.id ?? 0}
        preselectedType={preselectedType}
        preselectedStopId={preselectedStopId ?? undefined}
      />

      {load && (
        <DocumentViewerDialog
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          entityType="load"
          entityId={load.id}
          initialDocumentId={viewerDocId}
        />
      )}

      <AlertDialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send back for review?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unlock charges for editing. The load will need to be re-approved before invoicing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="send-back-reason">Reason</Label>
            <Textarea
              id="send-back-reason"
              placeholder="What needs to be changed?"
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              disabled={!sendBackReason.trim()}
              loading={sendBack.isPending}
              onClick={() => {
                if (!load) return;
                sendBack.mutate(
                  { loadId: load.loadNumber, reason: sendBackReason.trim() },
                  {
                    onSuccess: () => {
                      setSendBackOpen(false);
                      setLocalBillingStatus('READY_FOR_REVIEW');
                    },
                  },
                );
              }}
            >
              Send Back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
