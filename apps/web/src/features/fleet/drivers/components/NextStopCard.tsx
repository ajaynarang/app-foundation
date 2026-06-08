'use client';

import { useRouter } from 'next/navigation';
import { MapPin, Navigation, Phone, Clock, CheckCircle, AlertTriangle, MessageCircle } from 'lucide-react';
import { Card, CardContent } from '@sally/ui/components/ui/card';
import { Badge } from '@sally/ui/components/ui/badge';
import { Button } from '@sally/ui/components/ui/button';
import { Skeleton } from '@sally/ui/components/ui/skeleton';
import type { LoadStop } from '@/features/fleet/loads/types';
import { useFormatters } from '@/shared/providers/PreferencesProvider';

interface NextStopCardProps {
  stop: LoadStop;
  onNavigate?: () => void;
  isLoading?: boolean;
}

function getOnTimeStatus(eta?: string, appointment?: string) {
  if (!eta || !appointment) return 'unknown';
  const etaDate = new Date(eta);
  const apptDate = new Date(appointment);
  const diff = apptDate.getTime() - etaDate.getTime();
  const minutes = diff / 60_000;
  if (minutes > 30) return 'on-time';
  if (minutes > 0) return 'tight';
  return 'late';
}

export function NextStopCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

export function NextStopCard({ stop, onNavigate, isLoading }: NextStopCardProps) {
  const router = useRouter();
  const { formatTime } = useFormatters();
  if (isLoading) return <NextStopCardSkeleton />;

  const address = [stop.stopAddress, stop.stopCity, stop.stopState].filter(Boolean).join(', ');

  const onTimeStatus = getOnTimeStatus(stop.earliestArrival, stop.appointmentDate);

  const phoneNumber = undefined; // stop.stop_phone — available when schema supports it

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate text-base">{stop.stopName || 'Stop'}</h3>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{address || 'Address unavailable'}</span>
            </p>
          </div>
          <Badge variant="outline" className="shrink-0 capitalize">
            {stop.actionType}
          </Badge>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {stop.appointmentDate && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Appt: {formatTime(stop.appointmentDate)}
            </span>
          )}
          {onTimeStatus === 'on-time' && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <CheckCircle className="h-3.5 w-3.5" />
              On time
            </span>
          )}
          {onTimeStatus === 'tight' && (
            <span className="flex items-center gap-1 text-caution">
              <AlertTriangle className="h-3.5 w-3.5" />
              Tight
            </span>
          )}
          {onTimeStatus === 'late' && (
            <span className="flex items-center gap-1 text-critical">
              <AlertTriangle className="h-3.5 w-3.5" />
              Late
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button className="flex-1 h-11" onClick={onNavigate}>
            <Navigation className="mr-1.5 h-4 w-4" />
            Navigate
          </Button>
          <Button variant="outline" size="icon" className="h-11 w-11" onClick={() => router.push('/driver/sally')}>
            <MessageCircle className="h-4 w-4" />
          </Button>
          {phoneNumber && (
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11"
              onClick={() => window.open(`tel:${phoneNumber}`, '_self')}
            >
              <Phone className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
