'use client';

import type { ReactNode } from 'react';
import { Badge } from '@sally/ui/components/ui/badge';
import { FormSheet } from '@/shared/components/ui/form-sheet';
import { cn } from '@sally/ui';
import { STATUS_VARIANTS } from '../constants';
import type { LoginActivityEvent } from '../types';
import { failReasonLabel, userDisplayName } from '../utils';

interface LoginEventDetailSheetProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  event: LoginActivityEvent | null;
}

/**
 * View-only detail sheet for a single login event.
 *
 * Uses FormSheet `mode="view"` so outside-click / Escape / X all close (no
 * dirty-data trap — there's nothing to save).
 */
export function LoginEventDetailSheet({ open, onOpenChange, event }: LoginEventDetailSheetProps) {
  if (!event) return null;
  const variant = STATUS_VARIANTS[event.status];

  return (
    <FormSheet open={open} onOpenChange={onOpenChange} title="Login event details" mode="view">
      <div className="space-y-4">
        <Row label="When">
          <span title={event.createdAt}>{new Date(event.createdAt).toLocaleString()}</span>
        </Row>
        <Row label="Status">
          <Badge className={cn('px-2 py-0.5 text-xs font-medium', variant.className)}>{variant.label}</Badge>
        </Row>
        <Row label="User">
          <div>
            <div className="text-sm">{userDisplayName(event.user)}</div>
            {event.user && (
              <div className="text-xs text-muted-foreground">
                {event.user.email} · {event.user.role}
              </div>
            )}
          </div>
        </Row>
        {event.tenant && <Row label="Tenant">{event.tenant.name}</Row>}
        <Row label="IP">{event.ip ?? '—'}</Row>
        <Row label="Device">{event.deviceLabel ?? '—'}</Row>
        <Row label="User agent">
          <p className="break-all text-xs text-muted-foreground">{event.userAgent ?? '—'}</p>
        </Row>
        <Row label="Device ID">
          <p className="break-all font-mono text-xs text-muted-foreground">{event.deviceId ?? '—'}</p>
        </Row>
        <Row label="Session ID">
          <p className="break-all font-mono text-xs text-muted-foreground">{event.sessionId ?? '—'}</p>
        </Row>
        {event.failReason && <Row label="Failure reason">{failReasonLabel(event.failReason)}</Row>}
      </div>
    </FormSheet>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="col-span-2 text-sm text-foreground">{children}</div>
    </div>
  );
}
