'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@sally/ui/components/ui/dialog';
import { Button } from '@sally/ui/components/ui/button';
import { Input } from '@sally/ui/components/ui/input';
import { Label } from '@sally/ui/components/ui/label';
import { Checkbox } from '@sally/ui/components/ui/checkbox';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import { Separator } from '@sally/ui/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@sally/ui/components/ui/select';
import { CheckCircle2, Clock, ExternalLink, XCircle } from 'lucide-react';
import { showError, showSuccess } from '@sally/ui';
import { BundleFormatSchema, type DocBundleInfo } from '@sally/shared-types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { openConsole } from '@/shared/lib/console-url';
import { extractErrorMessage } from '@/shared/lib/error-utils';
import { useFactoringCompanies, useSubmitToFactor, useBatchSubmitToFactor } from '../hooks/use-invoices';
import { useTenantFactoringDefault } from '@/features/financials/invoicing';
import { invoicesApi } from '../api';
import { SendNoaDialog, type SendNoaDialogContext } from './send-noa-dialog';

interface SubmitToFactorDialogProps {
  mode: 'single' | 'batch';
  invoiceId?: string;
  invoiceIds?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function SubmitToFactorDialog({
  mode,
  invoiceId,
  invoiceIds,
  open,
  onOpenChange,
  onSuccess,
}: SubmitToFactorDialogProps) {
  const [companyId, setCompanyId] = useState('');
  const [reference, setReference] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [sendCtx, setSendCtx] = useState<SendNoaDialogContext | null>(null);

  const { data: companies, isLoading: companiesLoading } = useFactoringCompanies();
  const { data: tenantDefault } = useTenantFactoringDefault();
  const submitSingle = useSubmitToFactor();
  const submitBatch = useBatchSubmitToFactor();

  // Fetch doc bundle info for single mode. Refetch on window-focus so coming
  // back to the original tab after uploading a missing doc in the deep-linked
  // load detail sheet auto-refreshes the dialog (Scenario B in the spec).
  const { data: docBundle, isLoading: docBundleLoading } = useQuery<DocBundleInfo>({
    queryKey: ['invoices', invoiceId, 'doc-bundle'],
    queryFn: () => invoicesApi.getDocBundleInfo(invoiceId!),
    enabled: open && mode === 'single' && !!invoiceId,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  // Phase 3: NOA gate. Fetch NOA status for the (customer, factor) pair so
  // the dialog can mirror the bundle gate's disabled-with-action UX.
  const { data: noaStatus, isLoading: noaLoading } = useQuery({
    queryKey: ['invoices', invoiceId, 'noa-status'],
    queryFn: () => invoicesApi.getNoaStatusForInvoice(invoiceId!),
    enabled: open && mode === 'single' && !!invoiceId,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
  });

  const queryClient = useQueryClient();
  const markNoaAckMutation = useMutation({
    mutationFn: (noaId: string) => invoicesApi.updateNoaStatus(noaId, { status: 'ACKNOWLEDGED' }),
    onSuccess: () => {
      showSuccess('NOA marked acknowledged');
      queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'noa-status'] });
    },
    onError: (error) => showError('Could not update NOA', extractErrorMessage(error)),
  });

  const isPending = submitSingle.isPending || submitBatch.isPending;

  // Auto-select the tenant's default factor (Phase 1 overhaul:
  // FactoringCompany.isDefault is gone; the source of truth is
  // Tenant.defaultFactoringCompanyId).
  useEffect(() => {
    if (companies && companies.length > 0 && !companyId && tenantDefault?.factoringCompany) {
      setCompanyId(tenantDefault.factoringCompany.companyId);
    }
  }, [companies, companyId, tenantDefault]);

  const resetForm = () => {
    setCompanyId('');
    setReference('');
    setSendEmail(true);
  };

  const handleSubmit = () => {
    if (!companyId) return;

    const data = {
      factoringCompanyId: companyId,
      factoringReference: reference || undefined,
      sendEmail,
    };

    if (mode === 'single' && invoiceId) {
      submitSingle.mutate(
        { invoiceId, data },
        {
          onSuccess: () => {
            resetForm();
            onOpenChange(false);
            onSuccess?.();
          },
        },
      );
    } else if (mode === 'batch' && invoiceIds?.length) {
      submitBatch.mutate(
        { invoiceIds, data },
        {
          onSuccess: () => {
            resetForm();
            onOpenChange(false);
            onSuccess?.();
          },
        },
      );
    }
  };

  const handlePreview = async () => {
    if (!invoiceId || isPreviewLoading) return;
    setIsPreviewLoading(true);
    try {
      await invoicesApi.previewDocBundle(invoiceId);
    } catch (error) {
      showError('Could not generate bundle preview', extractErrorMessage(error));
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const count = mode === 'batch' ? (invoiceIds?.length ?? 0) : 1;
  const hasCompanies = !companiesLoading && companies && companies.length > 0;

  // Submit is disabled in single mode until BOTH gates pass:
  //   1. Bundle ready (Phase 2)
  //   2. NOA acknowledged (Phase 3)
  // Batch mode runs the same server-side guards per invoice and surfaces
  // skips in the response toast (we don't pre-check N invoices in the dialog).
  const docBundleReady = mode === 'batch' || (docBundle?.ready ?? false);
  const noaAcknowledged = mode === 'batch' || noaStatus?.noa?.status === 'ACKNOWLEDGED';
  const submitDisabled =
    !companyId ||
    (mode === 'single' && !docBundleLoading && !docBundleReady) ||
    (mode === 'single' && !noaLoading && !noaAcknowledged);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'batch' ? `Submit ${count} Invoice${count > 1 ? 's' : ''} to Factor` : 'Submit to Factor'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Phase 3: NOA gate — single mode only */}
          {mode === 'single' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Notice of Assignment (NOA)</Label>
                  {noaStatus?.noa && (
                    <span
                      className={
                        noaStatus.noa.status === 'ACKNOWLEDGED'
                          ? 'text-xs text-foreground'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {noaStatus.noa.status}
                    </span>
                  )}
                </div>
                {noaLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : noaStatus?.factoringCompanyId == null ? (
                  <p className="text-xs text-muted-foreground">
                    NOA not applicable — invoice is not on the FACTORED billing path.
                  </p>
                ) : !noaStatus?.noa ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3 bg-muted/30">
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                      No NOA on file for {noaStatus?.customer?.companyName ?? 'this customer'}.
                    </span>
                  </div>
                ) : noaStatus.noa.status === 'ACKNOWLEDGED' ? (
                  <div className="flex items-center gap-2 rounded-md border border-border p-3 bg-muted/30 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
                    <span className="text-foreground">Acknowledged by {noaStatus.customer.companyName}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border p-3 bg-muted/30">
                    <span className="flex items-center gap-2 text-sm">
                      {noaStatus.noa.status === 'SENT' ? (
                        <Clock className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      )}
                      <span className="text-muted-foreground">
                        {noaStatus.noa.status === 'NOT_SENT'
                          ? 'Not sent'
                          : noaStatus.noa.status === 'SENT'
                            ? 'Sent — awaiting acknowledgment'
                            : 'Rejected'}
                      </span>
                    </span>
                    <div className="flex gap-1">
                      {(noaStatus.noa.status === 'NOT_SENT' || noaStatus.noa.status === 'REJECTED') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs"
                          onClick={() =>
                            setSendCtx({
                              noaId: noaStatus.noa!.noaId,
                              customerName: noaStatus.customer.companyName,
                              factoringCompanyName:
                                companies?.find(
                                  (c: { id: number; companyName: string }) => c.id === noaStatus.factoringCompanyId,
                                )?.companyName ?? 'the factor',
                            })
                          }
                        >
                          {noaStatus.noa.status === 'REJECTED' ? 'Resend NOA' : 'Send NOA'}
                        </Button>
                      )}
                      {noaStatus.noa.status === 'SENT' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto px-2 py-1 text-xs"
                          onClick={() => markNoaAckMutation.mutate(noaStatus.noa!.noaId)}
                          loading={markNoaAckMutation.isPending}
                        >
                          Mark acknowledged
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* Doc Bundle status — single mode only */}
          {mode === 'single' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Document Bundle</Label>
                  {docBundle && !docBundleLoading && (
                    <span className={docBundle.ready ? 'text-xs text-foreground' : 'text-xs text-muted-foreground'}>
                      {docBundle.docs.filter((d) => d.available).length} of {docBundle.docs.length} ready
                    </span>
                  )}
                </div>
                {docBundleLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/4" />
                  </div>
                ) : docBundle?.docs ? (
                  <div className="space-y-1.5 rounded-md border border-border p-3 bg-muted/30">
                    {docBundle.docs.map((doc) => (
                      <div key={doc.type} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          {doc.available ? (
                            <CheckCircle2 className="h-4 w-4 text-blue-400 shrink-0" aria-hidden="true" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                          )}
                          <span className={doc.available ? 'text-foreground' : 'text-muted-foreground'}>
                            {doc.label}
                          </span>
                        </span>
                        {!doc.available && doc.uploadUrl && (
                          <a
                            href={doc.uploadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-9 items-center rounded-sm px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:text-foreground/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            Upload {doc.label}
                            <ExternalLink className="ml-1 h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Unable to load document info.</p>
                )}
                <div className="flex items-center justify-end pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePreview}
                    loading={isPreviewLoading}
                    disabled={!invoiceId || docBundleLoading}
                    aria-label={
                      tenantDefault?.bundleFormat === BundleFormatSchema.enum.MERGED_PDF
                        ? 'Preview merged factor bundle PDF in a new tab'
                        : 'Download factor bundle as ZIP'
                    }
                  >
                    {tenantDefault?.bundleFormat === BundleFormatSchema.enum.MERGED_PDF
                      ? 'Preview merged PDF'
                      : 'Download ZIP'}
                  </Button>
                </div>
              </div>
              <Separator />
            </>
          )}

          {/* Factoring Company */}
          <div className="space-y-2">
            <Label htmlFor="submit-factor-company">Factoring Company</Label>
            {companiesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : !companies || companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No factoring companies configured.{' '}
                <Button
                  variant="ghost"
                  className="h-auto p-0 text-foreground hover:text-foreground/80 hover:bg-transparent"
                  onClick={() => openConsole('/configuration/invoicing')}
                >
                  Set up in Console
                </Button>
              </p>
            ) : (
              <Select value={companyId} onValueChange={setCompanyId}>
                <SelectTrigger id="submit-factor-company">
                  <SelectValue placeholder="Select factoring company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c: { id: number; companyId: string; companyName: string }) => (
                    <SelectItem key={c.id} value={c.companyId}>
                      {c.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {hasCompanies && (
            <>
              {/* Reference Number */}
              <div className="space-y-2">
                <Label htmlFor="submit-factor-ref">Reference # (optional)</Label>
                <Input
                  id="submit-factor-ref"
                  placeholder="e.g. FC-12345"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              </div>

              {/* Email checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="submit-factor-email"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked === true)}
                />
                <Label htmlFor="submit-factor-email" className="text-sm font-normal">
                  Email document bundle to factoring company
                </Label>
              </div>

              <Button
                className="w-full"
                onClick={handleSubmit}
                loading={isPending}
                disabled={submitDisabled}
                aria-label={
                  mode === 'single' && !docBundleReady
                    ? 'Add missing documents before submitting'
                    : 'Submit invoice to factor'
                }
              >
                {mode === 'batch' ? `Submit ${count} Invoice${count > 1 ? 's' : ''}` : 'Submit to Factor'}
              </Button>
              {mode === 'single' && !docBundleLoading && docBundle && !docBundle.ready && (
                <p className="text-xs text-muted-foreground text-center">
                  Add the missing documents before submitting.
                </p>
              )}
              {mode === 'single' && !noaLoading && !noaAcknowledged && noaStatus?.factoringCompanyId != null && (
                <p className="text-xs text-muted-foreground text-center">
                  NOA must be acknowledged by {noaStatus?.customer?.companyName ?? 'the broker'} before submitting.
                </p>
              )}
            </>
          )}
        </div>
        <SendNoaDialog
          open={!!sendCtx}
          onOpenChange={(open) => {
            if (!open) {
              setSendCtx(null);
              queryClient.invalidateQueries({ queryKey: ['invoices', invoiceId, 'noa-status'] });
            }
          }}
          context={sendCtx}
        />
      </DialogContent>
    </Dialog>
  );
}
