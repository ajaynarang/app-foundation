'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Paperclip, MapPin, ArrowRight } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { EmailIngestThread } from '../types';
import { EmailFilterBadge } from './EmailFilterBadge';

interface EmailThreadCardProps {
  thread: EmailIngestThread;
  onClick: () => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function EmailThreadCard({ thread, onClick }: EmailThreadCardProps) {
  const allAttachments = thread.messages.flatMap((m) => m.attachments);

  // Best parsed attachment for inline preview
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

  const isConfirmed = thread.status === 'CONFIRMED';
  const isDiscarded = thread.status === 'DISCARDED';

  const relativeTime = formatDistanceToNowStrict(new Date(thread.createdAt), {
    addSuffix: true,
  });

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`cursor-pointer transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        isDiscarded ? 'opacity-50' : ''
      } ${bestParsed ? 'hover:bg-accent/50 hover:border-foreground/20' : 'hover:bg-accent/50'}`}
    >
      <CardContent className="p-3 space-y-2">
        {/* Header: sender email + relative time */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-mono text-foreground truncate">{thread.senderEmail}</span>
          <span className="text-2xs text-muted-foreground shrink-0">{relativeTime}</span>
        </div>

        {/* Subject */}
        <p className="text-sm text-foreground/80 truncate leading-snug">{thread.subject}</p>

        {/* Attachments */}
        {allAttachments.length > 0 && (
          <div className="space-y-1">
            {allAttachments.map((att) => (
              <div key={att.id} className="flex items-center gap-1.5 text-xs">
                <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground truncate flex-1 min-w-0">{att.fileName}</span>
                <EmailFilterBadge filterResult={att.filterResult} parseStatus={att.parseStatus} />
              </div>
            ))}
          </div>
        )}

        {/* Parsed preview block */}
        {parsed && (
          <div className="rounded-md border border-border bg-muted/30 p-2.5 space-y-1.5">
            {/* Load # + Rate */}
            <div className="flex items-center justify-between gap-2">
              {parsed.load_number && (
                <span className="text-xs font-mono text-muted-foreground truncate">#{parsed.load_number}</span>
              )}
              <span className="text-sm font-semibold text-foreground ml-auto">
                {formatCurrency(parsed.rate_total_usd)}
              </span>
            </div>

            {/* Route */}
            {(originLabel || destLabel) && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{originLabel ?? '?'}</span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="truncate">{destLabel ?? '?'}</span>
              </div>
            )}

            {/* Equipment badge */}
            {parsed.equipment_type && (
              <Badge variant="outline" className="text-2xs px-1.5 py-0 text-muted-foreground">
                {parsed.equipment_type}
              </Badge>
            )}
          </div>
        )}

        {/* Thread status badge for non-pending */}
        {isConfirmed && <Badge className="bg-emerald-500/20 text-emerald-400 border-0 text-2xs">Confirmed</Badge>}
        {isDiscarded && <Badge className="bg-muted text-muted-foreground border-0 text-2xs">Discarded</Badge>}
      </CardContent>
    </Card>
  );
}
