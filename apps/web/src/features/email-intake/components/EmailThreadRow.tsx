'use client';

import { MapPin, ArrowRight } from 'lucide-react';
import { formatDistanceToNowStrict, parseISO, format, isValid } from 'date-fns';
import { Badge } from '@sally/ui/components/ui/badge';
import { TableCell, TableRow } from '@sally/ui/components/ui/table';
import { cn } from '@sally/ui';
import type { EmailIngestThread } from '../types';

interface EmailThreadRowProps {
  thread: EmailIngestThread;
  showStatus?: boolean;
  onClick: () => void;
}

function formatCurrency(amount: number, fractionDigits = 0): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function formatPickup(dateStr?: string | null, timeStr?: string | null): string | null {
  if (!dateStr) return null;
  const parsed = parseISO(dateStr);
  if (!isValid(parsed)) return null;
  const datePart = format(parsed, 'MMM d');
  return timeStr ? `${datePart} · ${timeStr}` : datePart;
}

export function EmailThreadRow({ thread, showStatus = false, onClick }: EmailThreadRowProps) {
  const allAttachments = thread.messages.flatMap((m) => m.attachments);

  const bestParsed =
    allAttachments.find((a) => a.parseStatus === 'PARSED' && a.isLatestVersion && a.parsedData) ??
    allAttachments.find((a) => a.parseStatus === 'PARSED' && a.parsedData) ??
    null;
  const parsed = bestParsed?.parsedData ?? null;

  const pickups = parsed?.stops.filter((s) => s.action_type === 'pickup') ?? [];
  const deliveries = parsed?.stops.filter((s) => s.action_type === 'delivery') ?? [];
  const firstPickup = pickups[0] ?? null;
  const lastDelivery = deliveries[deliveries.length - 1] ?? null;

  const originLabel = firstPickup?.city && firstPickup?.state ? `${firstPickup.city}, ${firstPickup.state}` : null;
  const destLabel = lastDelivery?.city && lastDelivery?.state ? `${lastDelivery.city}, ${lastDelivery.state}` : null;
  const pickupLabel = formatPickup(firstPickup?.appointment_date, firstPickup?.appointment_time);

  const isDiscarded = thread.status === 'DISCARDED';
  const isConfirmed = thread.status === 'CONFIRMED';

  const relativeTime = formatDistanceToNowStrict(new Date(thread.createdAt), { addSuffix: true });

  const rpm =
    parsed?.rate_total_usd != null && parsed.miles && parsed.miles > 0 ? parsed.rate_total_usd / parsed.miles : null;

  const brokerName = parsed?.broker_name ?? null;

  return (
    <TableRow
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      title={thread.subject}
      className={cn(
        'cursor-pointer focus-visible:outline-none focus-visible:bg-accent/50',
        isDiscarded && 'opacity-60',
      )}
    >
      {/* Broker (primary) + Sender email (secondary) */}
      <TableCell className="max-w-[260px]">
        <div className="flex flex-col leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{brokerName ?? thread.senderEmail}</span>
          {brokerName && (
            <span className="truncate text-2xs font-mono text-muted-foreground">{thread.senderEmail}</span>
          )}
        </div>
      </TableCell>

      {/* Route — hidden on mobile */}
      <TableCell className="hidden sm:table-cell max-w-[220px]">
        {originLabel || destLabel ? (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{originLabel ?? '?'}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="truncate">{destLabel ?? '?'}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      {/* Pickup — hidden below lg */}
      <TableCell className="hidden lg:table-cell whitespace-nowrap">
        {pickupLabel ? (
          <span className="text-xs text-foreground/85 tabular-nums">{pickupLabel}</span>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      {/* Rate + RPM stacked */}
      <TableCell className="text-right tabular-nums">
        {parsed?.rate_total_usd != null ? (
          <div className="flex flex-col items-end leading-tight">
            <span className="text-sm font-semibold text-foreground">{formatCurrency(parsed.rate_total_usd)}</span>
            {rpm != null && <span className="text-2xs text-muted-foreground">{formatCurrency(rpm, 2)}/mi</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      {/* Equipment — hidden below md */}
      <TableCell className="hidden md:table-cell">
        {parsed?.equipment_type ? (
          <Badge variant="outline" className="text-2xs px-1.5 py-0 font-normal text-muted-foreground">
            {parsed.equipment_type}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground/60">—</span>
        )}
      </TableCell>

      {/* Received */}
      <TableCell className="text-right">
        <span className="text-xs text-muted-foreground whitespace-nowrap">{relativeTime}</span>
      </TableCell>

      {/* Status — only when on Archive */}
      {showStatus && (
        <TableCell>
          {isConfirmed && (
            <Badge className="bg-emerald-500/15 text-emerald-500 dark:text-emerald-400 border-0 text-2xs">
              Confirmed
            </Badge>
          )}
          {isDiscarded && <Badge className="bg-muted text-muted-foreground border-0 text-2xs">Discarded</Badge>}
          {!isConfirmed && !isDiscarded && <span className="text-xs text-muted-foreground/60">—</span>}
        </TableCell>
      )}
    </TableRow>
  );
}
