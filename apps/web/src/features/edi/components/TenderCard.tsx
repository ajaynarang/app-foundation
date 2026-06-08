'use client';

import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { MapPin, Clock, ArrowRight } from 'lucide-react';
import type { EDITender } from '../types';
import { useRespondToTender } from '../hooks/use-edi';
import { useCountdown } from '../hooks/use-countdown';
import { getRateColor, deriveTenderRoute, computeRatePerMile } from '../lib/tender-utils';
import { formatCents } from '@/shared/lib/utils/formatters';

export function TenderCard({ tender }: { tender: EDITender }) {
  const respond = useRespondToTender();
  const { label: countdownLabel, urgency } = useCountdown(tender.expiresAt);

  const brokerName = tender.parsedData?.brokerName ?? tender.tradingPartner?.name ?? 'Unknown';
  const rateCents = tender.parsedData?.rateCents ?? tender.load?.rateCents ?? null;
  const miles = tender.load?.estimatedMiles ?? null;
  const equipmentType = tender.parsedData?.equipmentType ?? tender.load?.requiredEquipmentType ?? null;

  const { origin, destination } = deriveTenderRoute(tender);
  const ratePerMile = computeRatePerMile(tender);
  const ratePerMileLabel = rateCents && miles && miles > 0 ? (rateCents / 100 / miles).toFixed(2) : null;
  const rateColor = ratePerMile > 0 ? getRateColor(ratePerMile) : 'text-muted-foreground';

  const loadId = tender.load?.id;
  const canRespond = !!loadId;
  const isExpired = urgency === 'expired';

  const handleRespond = (response: 'accept' | 'decline' | 'counter') => {
    if (!loadId) return;
    respond.mutate({ loadId, data: { response } });
  };

  return (
    <Card className="hover:bg-accent/50 transition-all duration-200">
      <CardContent className="p-3 space-y-2">
        {/* Header: broker + countdown */}
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">{brokerName}</span>
          {countdownLabel && (
            <Badge
              variant="outline"
              className={`text-2xs px-1.5 py-0 shrink-0 ${
                urgency === 'expired'
                  ? 'text-red-400 border-red-500/30'
                  : urgency === 'critical'
                    ? 'text-red-400 border-red-500/30'
                    : 'text-amber-400 border-amber-500/30'
              }`}
            >
              <Clock className="h-2.5 w-2.5 mr-0.5" />
              {countdownLabel}
            </Badge>
          )}
        </div>

        {/* Reference number */}
        {tender.referenceNumber && (
          <p className="text-xs text-muted-foreground font-mono truncate">Ref: {tender.referenceNumber}</p>
        )}

        {/* Route */}
        {(origin || destination) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{origin ?? '?'}</span>
            <ArrowRight className="h-3 w-3 shrink-0" />
            <span className="truncate">{destination ?? '?'}</span>
          </div>
        )}

        {/* Rate + equipment */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {rateCents != null && (
              <span className={`text-sm font-semibold ${rateColor}`}>{formatCents(rateCents)}</span>
            )}
            {ratePerMileLabel && <span className={`text-xs ${rateColor}`}>(${ratePerMileLabel}/mi)</span>}
          </div>
          {equipmentType && (
            <Badge variant="outline" className="text-2xs px-1.5 py-0 text-muted-foreground">
              {equipmentType}
            </Badge>
          )}
        </div>

        {/* Miles */}
        {miles != null && <p className="text-xs text-muted-foreground">{miles.toLocaleString()} mi</p>}

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 pt-1">
          <Button
            size="sm"
            className="flex-1 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={isExpired || !canRespond}
            loading={respond.isPending && respond.variables?.data.response === 'accept'}
            onClick={(e) => {
              e.stopPropagation();
              handleRespond('accept');
            }}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 min-h-[44px] border-violet-500/30 text-violet-400 hover:bg-violet-500/10"
            disabled={isExpired || !canRespond}
            loading={respond.isPending && respond.variables?.data.response === 'counter'}
            onClick={(e) => {
              e.stopPropagation();
              handleRespond('counter');
            }}
          >
            Counter
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-h-[44px] text-muted-foreground hover:text-foreground"
            disabled={isExpired || !canRespond}
            loading={respond.isPending && respond.variables?.data.response === 'decline'}
            onClick={(e) => {
              e.stopPropagation();
              handleRespond('decline');
            }}
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
