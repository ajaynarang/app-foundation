'use client';

import { useState, useEffect } from 'react';
import { formatLoadLabel } from '@sally/shared-types';
import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@sally/ui/components/ui/sheet';
import { SheetSizeControls } from '@/shared/components/ui/sheet-size-controls';
import { useSheetSizing, sizeModeToPixels } from '@/shared/hooks/use-sheet-sizing';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sally/ui/components/ui/alert-dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Separator } from '@sally/ui/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@sally/ui/components/ui/table';
import {
  useSendInvoice,
  useVoidInvoice,
  useResendInvoice,
  useCreateShareLink,
  useReInvoice,
} from '../hooks/use-invoices';
import { RecordPaymentDialog } from './record-payment-dialog';
import { SubmitToFactorDialog } from './submit-to-factor-dialog';
import { FactoringMoneySection } from './factoring-money-section';
import { RecordTransactionDialog } from './record-transaction-dialog';
import type { FactoringTxnType } from '@sally/shared-types';
import { BillingPathBadge } from './billing-path-badge';
import { FactorSourceChip } from './factor-source-chip';
import { OverdueLabel } from './overdue-label';
import { CustomerPaymentStats } from './customer-payment-stats';
import type { Invoice, LineItemType } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sally/ui/components/ui/dropdown-menu';
import {
  Send,
  Ban,
  DollarSign,
  Eye,
  Download,
  Link2,
  RotateCcw,
  Building2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import { formatCents } from '@/shared/lib/utils/formatters';
import { SEMANTIC_COLORS } from '@/shared/lib/colors';
import { useFormatters } from '@/shared/providers/PreferencesProvider';
import { DISPLAY_FORMATS } from '@/shared/lib/utils/date-utils';
import { InvoiceStatusBadge } from './invoice-status-badge';
import { invoicesApi } from '../api';
import { showSuccess, showError } from '@sally/ui';
import { PdfPreviewDialog } from '@/features/fleet/documents/components/viewer';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { Textarea } from '@sally/ui/components/ui/textarea';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { useUpdateInvoice } from '../hooks/use-invoices';
import { SendInvoiceDialog } from './send-invoice-dialog';
import { useAccountingStatus, useSyncInvoiceToAccounting } from '@/features/integrations/accounting/hooks';

interface InvoiceDetailSheetProps {
  invoice: Invoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Human-readable line item type labels
const lineItemTypeLabels: Record<LineItemType, string> = {
  LINEHAUL: 'Linehaul',
  FUEL_SURCHARGE: 'Fuel Surcharge',
  DETENTION_PICKUP: 'Detention (Pickup)',
  DETENTION_DELIVERY: 'Detention (Delivery)',
  LAYOVER: 'Layover',
  LUMPER: 'Lumper',
  TONU: 'TONU',
  ACCESSORIAL: 'Accessorial',
  ADJUSTMENT: 'Adjustment',
};

// Badge color per line item type (TONU = neutral, FUEL_SURCHARGE = info, DETENTION = caution)
const lineItemTypeBadge: Record<LineItemType, string> = {
  LINEHAUL: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  FUEL_SURCHARGE: `${SEMANTIC_COLORS.info.bg} ${SEMANTIC_COLORS.info.text}`,
  DETENTION_PICKUP: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  DETENTION_DELIVERY: `${SEMANTIC_COLORS.caution.bg} ${SEMANTIC_COLORS.caution.text}`,
  LAYOVER: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  LUMPER: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  TONU: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  ACCESSORIAL: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
  ADJUSTMENT: `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`,
};

export function InvoiceDetailSheet({ invoice, open, onOpenChange }: InvoiceDetailSheetProps) {
  const { formatCalendarDate, formatTimestamp, isCalendarDateOverdue } = useFormatters();
  const sizing = useSheetSizing('invoice');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [submitFactorOpen, setSubmitFactorOpen] = useState(false);
  const [recordTxnType, setRecordTxnType] = useState<FactoringTxnType | null>(null);

  const sendInvoice = useSendInvoice();
  const voidInvoice = useVoidInvoice();
  const resendInvoice = useResendInvoice();
  const createShareLink = useCreateShareLink();
  const reInvoice = useReInvoice();

  const { data: accountingStatus } = useAccountingStatus();
  const syncInvoice = useSyncInvoiceToAccounting();

  // Polling: after sync queued, poll for up to 30s until externalSyncedAt changes
  const [pollingSince, setPollingSince] = useState<number | null>(null);
  useQuery({
    queryKey: ['invoices', invoice.invoiceNumber, 'sync-poll'],
    queryFn: () => invoicesApi.getById(invoice.invoiceNumber),
    enabled: pollingSince !== null && !invoice.externalSyncedAt,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
    gcTime: 0,
  });

  // Stop polling after 30s or when synced
  useEffect(() => {
    if (pollingSince !== null && (invoice.externalSyncedAt || Date.now() - pollingSince > 30_000)) {
      setPollingSince(null);
    }
  }, [pollingSince, invoice.externalSyncedAt]);

  const handleSyncToQB = () => {
    syncInvoice.mutate(invoice.invoiceNumber, {
      onSuccess: () => {
        setPollingSince(Date.now());
      },
    });
  };

  const [editing, setEditing] = useState(false);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sendDialogMode, setSendDialogMode] = useState<'send' | 'resend'>('send');
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Edit form state
  const [editTerms, setEditTerms] = useState(String(invoice.paymentTermsDays));
  const [editNotes, setEditNotes] = useState(invoice.notes || '');
  const [editInternalNotes, setEditInternalNotes] = useState(invoice.internalNotes || '');
  const [editAdjustment, setEditAdjustment] = useState((invoice.adjustmentCents / 100).toFixed(2));

  const updateInvoice = useUpdateInvoice();

  // Reset edit mode when switching between invoices
  useEffect(() => {
    setEditing(false);
  }, [invoice.invoiceNumber]);

  const isOverdue =
    !['PAID', 'VOID', 'FACTORED', 'DRAFT'].includes(invoice.status) && isCalendarDateOverdue(invoice.dueDate);

  const handleStartEdit = () => {
    setEditTerms(String(invoice.paymentTermsDays));
    setEditNotes(invoice.notes || '');
    setEditInternalNotes(invoice.internalNotes || '');
    setEditAdjustment((invoice.adjustmentCents / 100).toFixed(2));
    setEditing(true);
  };

  const handleCancelEdit = () => {
    setEditing(false);
  };

  const handleSaveEdit = () => {
    const parsed = parseFloat(editAdjustment || '0');
    if (isNaN(parsed)) {
      showError('Invalid adjustment amount');
      return;
    }
    const adjustmentCents = Math.round(parsed * 100);
    updateInvoice.mutate(
      {
        invoiceId: invoice.invoiceNumber,
        data: {
          paymentTermsDays: Number(editTerms),
          notes: editNotes || undefined,
          internalNotes: editInternalNotes || undefined,
          adjustmentCents,
        },
      },
      {
        onSuccess: () => {
          setEditing(false);
        },
      },
    );
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    }
  };

  const handleConfirmSend = () => {
    sendInvoice.mutate(
      { invoiceId: invoice.invoiceNumber, sendEmail: true },
      {
        onSuccess: () => {
          setSendDialogOpen(false);
        },
      },
    );
  };

  const handleConfirmResend = () => {
    resendInvoice.mutate(invoice.invoiceNumber, {
      onSuccess: () => {
        setSendDialogOpen(false);
      },
    });
  };

  const handlePreviewPdf = async () => {
    try {
      const blobUrl = await invoicesApi.getPreviewBlobUrl(invoice.invoiceNumber);
      setPdfPreviewUrl(blobUrl);
      setPdfPreviewOpen(true);
    } catch {
      showError('Failed to load PDF preview');
    }
  };

  const handleDownloadPdf = () => {
    invoicesApi.downloadPdf(invoice.invoiceNumber);
  };

  const handleShareLink = () => {
    createShareLink.mutate(invoice.invoiceNumber, {
      onSuccess: (data) => {
        navigator.clipboard.writeText(data.url);
        showSuccess('Share link copied to clipboard');
      },
    });
  };

  const handleSend = () => {
    setSendDialogMode('send');
    setSendDialogOpen(true);
  };

  const handleMarkSent = () => {
    sendInvoice.mutate({ invoiceId: invoice.invoiceNumber, sendEmail: false });
  };

  const handleResend = () => {
    setSendDialogMode('resend');
    setSendDialogOpen(true);
  };

  const handleReInvoice = () => {
    reInvoice.mutate(invoice.invoiceNumber);
  };

  const handleVoid = () => {
    voidInvoice.mutate(invoice.invoiceNumber, {
      onSuccess: () => setVoidConfirmOpen(false),
    });
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
          <SheetHeader sticky actions={sizing.showControls ? <SheetSizeControls entityType="invoice" /> : undefined}>
            <div className="flex items-center gap-3 flex-wrap">
              <SheetTitle className="text-lg truncate">{invoice.invoiceNumber}</SheetTitle>
              <InvoiceStatusBadge status={invoice.status} />
              <BillingPathBadge billingPath={invoice.billingPath} />
              {isOverdue && <OverdueLabel dueDate={invoice.dueDate} status={invoice.status} />}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {invoice.customer?.companyName} &middot;{' '}
              {invoice.load?.loadNumber ? formatLoadLabel(invoice.load.loadNumber, invoice.load.referenceNumber) : ''}
            </div>
            {invoice.customer?.customerId && (
              <div className="mt-1">
                <CustomerPaymentStats customerId={invoice.customer.customerId} />
              </div>
            )}
            <SheetDescription className="sr-only">Invoice details for {invoice.invoiceNumber}</SheetDescription>
          </SheetHeader>

          {/* Scrollable content area */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 space-y-6">
              <FactorSourceChip invoice={invoice} customer={invoice.customer} />

              {/* Dates row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Issue Date</span>
                  <p className="font-medium text-foreground mt-0.5">
                    {formatCalendarDate(invoice.issueDate, DISPLAY_FORMATS.FRIENDLY)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Due Date</span>
                  <p className="font-medium text-foreground mt-0.5">
                    {formatCalendarDate(invoice.dueDate, DISPLAY_FORMATS.FRIENDLY)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs uppercase tracking-wide">Terms</span>
                  {editing ? (
                    <Select value={editTerms} onValueChange={setEditTerms}>
                      <SelectTrigger className="mt-1 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">COD</SelectItem>
                        <SelectItem value="7">Quick Pay (7 days)</SelectItem>
                        <SelectItem value="15">Net 15</SelectItem>
                        <SelectItem value="30">Net 30</SelectItem>
                        <SelectItem value="45">Net 45</SelectItem>
                        <SelectItem value="60">Net 60</SelectItem>
                        <SelectItem value="90">Net 90</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium text-foreground mt-0.5">
                      {invoice.paymentTermsDays === 0 ? 'COD' : `Net ${invoice.paymentTermsDays}`}
                    </p>
                  )}
                </div>
                {invoice.paidDate && (
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">Paid Date</span>
                    <p className="font-medium text-foreground mt-0.5">
                      {formatCalendarDate(invoice.paidDate, DISPLAY_FORMATS.FRIENDLY)}
                    </p>
                  </div>
                )}
              </div>

              <Separator />

              {/* Line Items */}
              <div>
                <h3 className="font-semibold text-foreground mb-3">Line Items</h3>
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right hidden sm:table-cell">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.lineItems?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge
                              className={`text-2xs px-1.5 py-0 ${lineItemTypeBadge[item.type] ?? `${SEMANTIC_COLORS.neutral.bg} ${SEMANTIC_COLORS.neutral.text}`}`}
                            >
                              {lineItemTypeLabels[item.type] ?? item.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-foreground text-sm">{item.description}</TableCell>
                          <TableCell className="text-right text-foreground">{item.quantity}</TableCell>
                          <TableCell className="text-right text-foreground hidden sm:table-cell">
                            {formatCents(item.unitPriceCents)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-foreground">
                            {formatCents(item.totalCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />

              {/* Financial Summary */}
              <div className="flex justify-end">
                <div className="w-full sm:w-64 space-y-2 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="text-foreground">{formatCents(invoice.subtotalCents)}</span>
                  </div>
                  {invoice.adjustmentCents !== 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Adjustments</span>
                      <span className="text-foreground">{formatCents(invoice.adjustmentCents)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-foreground">
                    <span>Total</span>
                    <span>{formatCents(invoice.totalCents)}</span>
                  </div>
                  {invoice.paidCents > 0 && (
                    <div className="flex justify-between text-foreground">
                      <span>Paid</span>
                      <span>{formatCents(invoice.paidCents)}</span>
                    </div>
                  )}
                  <Separator />
                  <div
                    className={`flex justify-between font-bold text-base ${
                      isOverdue ? SEMANTIC_COLORS.critical.text : 'text-foreground'
                    }`}
                  >
                    <span>Balance Due</span>
                    <span>{formatCents(invoice.balanceCents)}</span>
                  </div>
                </div>
              </div>

              {/* Payment History */}
              {invoice.payments && invoice.payments.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Payment History</h3>
                    <div className="overflow-x-auto rounded-md border border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead className="hidden sm:table-cell">Reference</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {invoice.payments.map((payment) => (
                            <TableRow key={payment.paymentId}>
                              <TableCell className="text-foreground">
                                {formatCalendarDate(payment.paymentDate, DISPLAY_FORMATS.FRIENDLY)}
                              </TableCell>
                              <TableCell className="text-muted-foreground capitalize">
                                {payment.paymentMethod?.replace(/_/g, ' ') ?? '\u2014'}
                              </TableCell>
                              <TableCell className="hidden sm:table-cell text-muted-foreground">
                                {payment.referenceNumber ?? '\u2014'}
                              </TableCell>
                              <TableCell className="text-right font-medium text-foreground">
                                {formatCents(payment.amountCents)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </>
              )}

              {/* Record payment inline for non-paid/void */}
              {invoice.status !== 'PAID' &&
                invoice.status !== 'VOID' &&
                !(invoice.payments && invoice.payments.length > 0) && (
                  <div className="text-sm text-muted-foreground">No payments recorded yet.</div>
                )}

              {/* Factoring Section */}
              {invoice.billingPath === 'FACTORED' && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-foreground mb-3">Factoring Details</h3>
                    {invoice.submittedToFactorAt ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">
                            Factoring Company
                          </span>
                          <p className="font-medium text-foreground mt-0.5">
                            {invoice.factoringCompanyId ? `Company #${invoice.factoringCompanyId}` : '\u2014'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Submitted Date</span>
                          <p className="font-medium text-foreground mt-0.5">
                            {formatTimestamp(invoice.submittedToFactorAt, DISPLAY_FORMATS.FRIENDLY)}
                          </p>
                        </div>
                        {invoice.factoringReference && (
                          <div>
                            <span className="text-muted-foreground text-xs uppercase tracking-wide">Reference #</span>
                            <p className="font-medium text-foreground mt-0.5">{invoice.factoringReference}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <p className="text-sm text-muted-foreground">Not yet submitted to factoring company.</p>
                        <Button size="sm" variant="outline" onClick={() => setSubmitFactorOpen(true)}>
                          <Building2 className="mr-1.5 h-3.5 w-3.5" />
                          Submit to Factor
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Phase 4 — Factoring money section (advance / fee / reserve / chargeback) */}
              {invoice.billingPath === 'FACTORED' && invoice.submittedToFactorAt && (
                <>
                  <Separator />
                  <FactoringMoneySection invoice={invoice} onRecord={(preset) => setRecordTxnType(preset)} />
                </>
              )}

              {/* QuickBooks Sync Status */}
              {(invoice.externalInvoiceId || invoice.externalSyncedAt || invoice.externalSyncError) && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold text-foreground mb-3 text-sm">QuickBooks Sync</h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {invoice.externalInvoiceId && (
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">QB Invoice ID</span>
                          <p className="font-medium text-foreground mt-0.5 font-mono text-xs">
                            {invoice.externalInvoiceId}
                          </p>
                        </div>
                      )}
                      {invoice.externalSyncedAt && (
                        <div>
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Last Synced</span>
                          <p className="font-medium text-foreground mt-0.5">
                            {formatTimestamp(invoice.externalSyncedAt)}
                          </p>
                        </div>
                      )}
                      {invoice.externalSyncError && (
                        <div className="col-span-2">
                          <span className="text-muted-foreground text-xs uppercase tracking-wide">Sync Error</span>
                          <p className={`${SEMANTIC_COLORS.critical.text} text-sm mt-0.5 whitespace-pre-wrap`}>
                            {invoice.externalSyncError}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              {editing ? (
                <>
                  <Separator />
                  <div className="space-y-4" onKeyDown={handleEditKeyDown}>
                    <div className="space-y-2">
                      <Label className="text-sm">Customer Notes</Label>
                      <Textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notes visible to the customer on the invoice"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Internal Notes</Label>
                      <Textarea
                        value={editInternalNotes}
                        onChange={(e) => setEditInternalNotes(e.target.value)}
                        placeholder="Internal notes (not on invoice)"
                        rows={3}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm">Adjustment ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={editAdjustment}
                        onChange={(e) => setEditAdjustment(e.target.value)}
                        placeholder="0.00"
                        className="w-40"
                      />
                      <p className="text-xs text-muted-foreground">Positive = surcharge, negative = credit</p>
                    </div>
                  </div>
                </>
              ) : (
                (invoice.notes || invoice.internalNotes) && (
                  <>
                    <Separator />
                    <div className="space-y-4">
                      {invoice.notes && (
                        <div>
                          <h3 className="font-semibold text-foreground mb-1 text-sm">Customer Notes</h3>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
                        </div>
                      )}
                      {invoice.internalNotes && (
                        <div>
                          <h3 className="font-semibold text-foreground mb-1 text-sm">Internal Notes</h3>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.internalNotes}</p>
                        </div>
                      )}
                    </div>
                  </>
                )
              )}
            </div>
          </div>

          {/* Sticky Action Footer */}
          <div className="border-t border-border bg-background px-6 py-4 flex items-center gap-2">
            {editing ? (
              <>
                <div className="flex-1" />
                <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={updateInvoice.isPending}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSaveEdit} loading={updateInvoice.isPending}>
                  Save Changes
                </Button>
              </>
            ) : (
              <>
                {/* Overflow menu (left side) */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {invoice.status === 'DRAFT' && (
                      <DropdownMenuItem onClick={handleMarkSent} disabled={sendInvoice.isPending}>
                        <Send className="mr-2 h-4 w-4" />
                        Mark as Sent
                      </DropdownMenuItem>
                    )}
                    {invoice.status !== 'DRAFT' && invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
                      <DropdownMenuItem onClick={handleResend} disabled={resendInvoice.isPending}>
                        <Send className="mr-2 h-4 w-4" />
                        Resend
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handlePreviewPdf}>
                      <Eye className="mr-2 h-4 w-4" />
                      Preview PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadPdf}>
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShareLink} disabled={createShareLink.isPending}>
                      <Link2 className="mr-2 h-4 w-4" />
                      Copy Share Link
                    </DropdownMenuItem>
                    {accountingStatus?.connected && invoice.status !== 'VOID' && (
                      <DropdownMenuItem onClick={handleSyncToQB} disabled={syncInvoice.isPending}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        {invoice.externalSyncedAt ? 'Re-sync to QB' : 'Sync to QB'}
                      </DropdownMenuItem>
                    )}
                    {invoice.status !== 'VOID' && invoice.status !== 'PAID' && invoice.status !== 'FACTORED' && (
                      <DropdownMenuItem onClick={() => setSubmitFactorOpen(true)}>
                        <Building2 className="mr-2 h-4 w-4" />
                        Submit to Factor
                      </DropdownMenuItem>
                    )}
                    {invoice.status !== 'VOID' && invoice.status !== 'PAID' && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setVoidConfirmOpen(true)}
                          disabled={voidInvoice.isPending}
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Void Invoice
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                <div className="flex-1" />

                {/* Primary + secondary actions (right side) */}
                {invoice.status === 'DRAFT' && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleStartEdit}>
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button size="sm" onClick={handleSend} loading={sendInvoice.isPending}>
                      <Send className="mr-1.5 h-3.5 w-3.5" />
                      Send Invoice
                    </Button>
                  </>
                )}
                {invoice.status !== 'PAID' &&
                  invoice.status !== 'VOID' &&
                  invoice.status !== 'DRAFT' &&
                  invoice.status !== 'FACTORED' && (
                    <Button size="sm" onClick={() => setPaymentOpen(true)}>
                      <DollarSign className="mr-1.5 h-3.5 w-3.5" />
                      Record Payment
                    </Button>
                  )}
                {invoice.status === 'VOID' && (
                  <Button size="sm" onClick={handleReInvoice} loading={reInvoice.isPending}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Re-invoice
                  </Button>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Record Payment Dialog */}
      <RecordPaymentDialog
        invoiceId={invoice.invoiceNumber}
        balanceCents={invoice.balanceCents}
        open={paymentOpen}
        onOpenChange={setPaymentOpen}
      />

      {/* Submit to Factor Dialog */}
      <SubmitToFactorDialog
        mode="single"
        invoiceId={invoice.invoiceNumber}
        open={submitFactorOpen}
        onOpenChange={setSubmitFactorOpen}
      />

      {/* Phase 4 — Record Factoring Transaction Dialog (advance/fee/reserve/chargeback/reversal) */}
      {recordTxnType && (
        <RecordTransactionDialog
          invoice={invoice}
          open={recordTxnType !== null}
          onOpenChange={(o) => !o && setRecordTxnType(null)}
          presetType={recordTxnType}
        />
      )}

      {/* Void Confirmation */}
      <AlertDialog open={voidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void Invoice?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to void invoice {invoice.invoiceNumber}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={handleVoid} loading={voidInvoice.isPending}>
              Void Invoice
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Send/Resend Email Preview Dialog */}
      <SendInvoiceDialog
        invoiceId={invoice.invoiceNumber}
        mode={sendDialogMode}
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        onConfirm={sendDialogMode === 'send' ? handleConfirmSend : handleConfirmResend}
        isPending={sendDialogMode === 'send' ? sendInvoice.isPending : resendInvoice.isPending}
      />

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
        title={`Invoice ${invoice.invoiceNumber}`}
        onDownload={() => invoicesApi.downloadPdf(invoice.invoiceNumber)}
      />
    </>
  );
}
