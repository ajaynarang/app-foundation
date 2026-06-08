'use client';

import { useCallback } from 'react';
import { Button } from '@sally/ui/components/ui/button';
import { Badge } from '@sally/ui/components/ui/badge';
import { Label } from '@sally/ui/components/ui/label';
import { Separator } from '@sally/ui/components/ui/separator';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { MapPin, ArrowRight } from 'lucide-react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { showSuccessWithLink, showError } from '@sally/ui';
import { useConfirmEmailLoad } from '../hooks/use-confirm-email-load';
import { useDiscardEmailThread } from '../hooks/use-discard-email-thread';
import { useRestoreEmailThread } from '../hooks/use-restore-email-thread';
import { useApproveSender } from '../hooks/use-approve-sender';
import type { EmailIngestThread, EmailIngestAttachment } from '../types';
import { extractErrorMessage } from '@/shared/lib/error-utils';

interface EmailImportSheetProps {
  thread: EmailIngestThread | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ReviewField({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (value == null || value === '') return null;
  return (
    <div className="space-y-0.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="text-sm text-foreground">{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

function formatCurrency(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function getBestAttachment(thread: EmailIngestThread): EmailIngestAttachment | null {
  // First pass: latest version, parsed
  for (const msg of thread.messages) {
    for (const att of msg.attachments) {
      if (att.parseStatus === 'PARSED' && att.isLatestVersion && att.parsedData) {
        return att;
      }
    }
  }
  // Fallback: any parsed attachment
  for (const msg of thread.messages) {
    for (const att of msg.attachments) {
      if (att.parseStatus === 'PARSED' && att.parsedData) {
        return att;
      }
    }
  }
  return null;
}

export function EmailImportSheet({ thread, open, onOpenChange }: EmailImportSheetProps) {
  const confirmLoad = useConfirmEmailLoad();
  const discardThread = useDiscardEmailThread();
  const restoreThread = useRestoreEmailThread();
  const approveSender = useApproveSender();

  const bestAttachment = thread ? getBestAttachment(thread) : null;
  const parsed = bestAttachment?.parsedData ?? null;

  const firstPickup = parsed?.stops.find((s) => s.action_type === 'pickup') ?? null;
  const lastDelivery = [...(parsed?.stops ?? [])].reverse().find((s) => s.action_type === 'delivery') ?? null;

  const originLabel = firstPickup?.city && firstPickup?.state ? `${firstPickup.city}, ${firstPickup.state}` : null;
  const destLabel = lastDelivery?.city && lastDelivery?.state ? `${lastDelivery.city}, ${lastDelivery.state}` : null;

  const firstMessage = thread?.messages[0] ?? null;
  const receivedAt = firstMessage?.receivedAt ?? thread?.createdAt ?? null;

  const handleImport = useCallback(() => {
    if (!thread || !bestAttachment) return;
    confirmLoad.mutate(
      {
        threadId: thread.id,
        attachmentId: bestAttachment.id,
        customerName: parsed?.broker_name ?? undefined,
        referenceNumber: parsed?.load_number ?? undefined,
        rateCents: parsed?.rate_total_usd != null ? Math.round(parsed.rate_total_usd * 100) : undefined,
        weightLbs: parsed?.weight_lbs ?? undefined,
        commodityType: parsed?.commodity ?? undefined,
      },
      {
        onSuccess: (result) => {
          onOpenChange(false);
          showSuccessWithLink(
            `Load ${result.loadNumber} imported as draft`,
            'View Load',
            `/dispatcher/loads?loadId=${result.loadNumber}`,
          );
        },
        onError: (err: Error) => {
          showError('Failed to import load', extractErrorMessage(err));
        },
      },
    );
  }, [thread, bestAttachment, parsed, confirmLoad, onOpenChange]);

  const handleDiscard = useCallback(() => {
    if (!thread) return;
    discardThread.mutate(thread.id, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  }, [thread, discardThread, onOpenChange]);

  const _handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleImport();
      }
    },
    [handleImport],
  );

  if (!thread) return null;

  const isPending = thread.status === 'PENDING';

  // Check if any attachment is held (SENDER_UNKNOWN) and not yet parsed
  const hasHeldAttachments = thread.messages.some((msg) =>
    msg.attachments.some((att) => att.filterResult === 'SENDER_UNKNOWN' && att.parseStatus === 'SKIPPED'),
  );

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={
        hasHeldAttachments
          ? 'Unknown Sender'
          : thread.status === 'CONFIRMED'
            ? 'Imported Load'
            : thread.status === 'DISCARDED'
              ? 'Discarded Email'
              : 'Review Email Load'
      }
      description={
        hasHeldAttachments
          ? `Email from ${thread.senderEmail} — approve this sender to parse the attachment`
          : thread.status === 'CONFIRMED'
            ? `Imported as draft load${parsed?.load_number ? ` #${parsed.load_number}` : ''}`
            : thread.status === 'DISCARDED'
              ? 'This email was discarded — restore to review again'
              : 'Review parsed rate-con data before importing as a draft load'
      }
      mode={isPending ? 'edit' : 'view'}
      onSubmit={
        hasHeldAttachments
          ? () => approveSender.mutate(thread.id, { onSuccess: () => onOpenChange(false) })
          : isPending
            ? handleImport
            : undefined
      }
      submitLabel={hasHeldAttachments ? 'Approve & Parse' : 'Import as Draft'}
      isSubmitting={hasHeldAttachments ? approveSender.isPending : confirmLoad.isPending}
      submitDisabled={hasHeldAttachments ? false : !bestAttachment}
      pinnable
      resizable
      footerExtra={
        <>
          {isPending && (
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
              onClick={handleDiscard}
              loading={discardThread.isPending}
            >
              Discard
            </Button>
          )}
          {thread?.status === 'CONFIRMED' && thread.confirmedLoadId && (
            <Button
              variant="outline"
              onClick={() => {
                window.location.href = `/dispatcher/loads?loadId=${thread.confirmedLoadId}`;
              }}
            >
              View Load {parsed?.load_number ? `#${parsed.load_number}` : ''}
            </Button>
          )}
          {thread?.status === 'DISCARDED' && (
            <Button
              variant="outline"
              onClick={() => {
                if (!thread) return;
                restoreThread.mutate(thread.id, {
                  onSuccess: () => onOpenChange(false),
                });
              }}
              loading={restoreThread.isPending}
            >
              Restore
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Hero stats — Rate + RPM, Pickup, Route */}
        {parsed && (parsed.rate_total_usd != null || originLabel || firstPickup?.appointment_date) && (
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="space-y-0.5">
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Rate</div>
              {parsed.rate_total_usd != null ? (
                <div className="space-y-0">
                  <div className="text-base font-semibold text-foreground tabular-nums">
                    {formatCurrency(parsed.rate_total_usd)}
                  </div>
                  {parsed.miles != null && parsed.miles > 0 && (
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(parsed.rate_total_usd / parsed.miles, 2)}/mi · {parsed.miles.toLocaleString()} mi
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground/60">—</div>
              )}
            </div>

            <div className="space-y-0.5">
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Pickup</div>
              {firstPickup?.appointment_date ? (
                <div className="space-y-0">
                  <div className="text-sm font-medium text-foreground">
                    {firstPickup.appointment_date}
                    {firstPickup.appointment_time && ` · ${firstPickup.appointment_time}`}
                  </div>
                  {originLabel && <div className="text-xs text-muted-foreground truncate">{originLabel}</div>}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground/60">—</div>
              )}
            </div>

            <div className="space-y-0.5">
              <div className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Route</div>
              {originLabel || destLabel ? (
                <div className="flex items-center gap-1 text-sm text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{originLabel ?? '?'}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{destLabel ?? '?'}</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground/60">—</div>
              )}
            </div>
          </div>
        )}

        {/* Load details grid */}
        {parsed && (
          <div className="grid grid-cols-2 gap-4">
            <ReviewField label="Equipment" value={parsed.equipment_type} />
            <ReviewField
              label="Weight"
              value={parsed.weight_lbs != null ? `${parsed.weight_lbs.toLocaleString()} lbs` : undefined}
            />
            <ReviewField label="Pieces" value={parsed.pieces} />
            <ReviewField label="Reference #" value={parsed.load_number} />
            <ReviewField label="Broker" value={parsed.broker_name} />
            <ReviewField label="MC #" value={parsed.broker_mc} />
          </div>
        )}

        {/* Stops */}
        {parsed && parsed.stops.length > 0 && (
          <>
            <Separator />
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stops</Label>
              <div className="mt-2 space-y-2">
                {parsed.stops.map((stop) => (
                  <div
                    key={stop.sequence}
                    className="flex items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2"
                  >
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-2xs px-1.5 py-0 border-0 ${
                        stop.action_type === 'pickup'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-sky-500/20 text-sky-400'
                      }`}
                    >
                      {stop.action_type === 'pickup' ? 'PU' : 'DEL'}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      {stop.facility_name && stop.facility_name.toLowerCase() !== 'unknown facility' && (
                        <div className="text-sm text-foreground truncate">{stop.facility_name}</div>
                      )}
                      {(stop.city || stop.state) && (
                        <div className="text-xs text-muted-foreground">
                          {[stop.city, stop.state, stop.zip_code].filter(Boolean).join(', ')}
                        </div>
                      )}
                      {(stop.appointment_date || stop.appointment_time) && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {[stop.appointment_date, stop.appointment_time].filter(Boolean).join(' ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Special Instructions */}
        {parsed?.special_instructions && (
          <>
            <Separator />
            <div>
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Special Instructions
              </Label>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed rounded-md border border-border bg-muted/30 px-3 py-2.5">
                {parsed.special_instructions}
              </p>
            </div>
          </>
        )}

        {/* No-parsed-data placeholder */}
        {!parsed && (
          <div className="rounded-md border border-dashed border-border bg-muted/20 p-4 text-center">
            <p className="text-sm text-muted-foreground">No parsed load details</p>
            <p className="mt-1 text-xs text-muted-foreground/80">
              {thread.status === 'DISCARDED'
                ? 'This email was discarded before a rate-con could be parsed.'
                : 'No attachment was successfully parsed for this email.'}
            </p>
          </div>
        )}

        <Separator />

        {/* Email source — always rendered */}
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
          <Label className="text-2xs font-medium text-muted-foreground uppercase tracking-wide">Email source</Label>
          <div className="mt-1 space-y-0.5">
            <div className="text-xs text-foreground/85 font-mono truncate">{thread.senderEmail}</div>
            <div className="text-xs text-muted-foreground truncate">{thread.subject}</div>
            {receivedAt && (
              <div className="text-xs text-muted-foreground">
                {formatDistanceToNowStrict(new Date(receivedAt), { addSuffix: true })}
                {' · '}
                {format(new Date(receivedAt), 'MMM d, yyyy h:mm a')}
              </div>
            )}
          </div>
        </div>
      </div>
    </FormSheet>
  );
}
