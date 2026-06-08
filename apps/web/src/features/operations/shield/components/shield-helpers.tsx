import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { Badge } from '@sally/ui/components/ui/badge';
import { SEMANTIC_COLORS, getShieldStatusColor, getSeverityColor } from '@/shared/lib/colors';
import type { ShieldFindingCategory, ShieldFindingSeverity, ShieldFindingSource, ShieldStatusLabel } from '../types';

export function getStatusColor(status: ShieldStatusLabel | null) {
  return SEMANTIC_COLORS[getShieldStatusColor(status ?? '')].text;
}

export function getStatusBgColor(status: ShieldStatusLabel | null) {
  return SEMANTIC_COLORS[getShieldStatusColor(status ?? '')].dot;
}

export function getStatusLabel(status: ShieldStatusLabel | null) {
  switch (status) {
    case 'PROTECTED':
      return 'PROTECTED';
    case 'AT_RISK':
      return 'AT RISK';
    case 'VULNERABLE':
      return 'VULNERABLE';
    default:
      return 'NO DATA';
  }
}

export function getSeverityBadge(severity: ShieldFindingSeverity) {
  switch (severity) {
    case 'CRITICAL':
      return <Badge variant="critical">CRITICAL</Badge>;
    case 'WARNING':
      return <Badge variant="caution">WARNING</Badge>;
    case 'PASSED':
      return <Badge variant="outline">PASSED</Badge>;
    case 'INFO':
      return <Badge variant="outline">INFO</Badge>;
  }
}

export function getSeverityIcon(severity: ShieldFindingSeverity) {
  const color = SEMANTIC_COLORS[getSeverityColor(severity)].text;
  switch (severity) {
    case 'CRITICAL':
      return <XCircle className={`h-4 w-4 ${color}`} />;
    case 'WARNING':
      return <AlertTriangle className={`h-4 w-4 ${color}`} />;
    case 'PASSED':
      return <CheckCircle2 className={`h-4 w-4 ${SEMANTIC_COLORS.neutral.text}`} />;
    case 'INFO':
      return <Info className={`h-4 w-4 ${SEMANTIC_COLORS.neutral.text}`} />;
  }
}

export function getSourceBadge(source: ShieldFindingSource) {
  switch (source) {
    case 'RULE':
      return (
        <Badge variant="outline" className="text-2xs px-1.5 py-0">
          Rule
        </Badge>
      );
    case 'AI':
      return (
        <Badge variant="outline" className="text-2xs px-1.5 py-0 border-info/30 text-info">
          Sally AI
        </Badge>
      );
    case 'CUSTOM':
      return (
        <Badge variant="outline" className="text-2xs px-1.5 py-0 border-dashed">
          Custom
        </Badge>
      );
  }
}

export function getEntityHref(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'driver':
      return `/dispatcher/fleet`; // Opens fleet page (driver detail sheets opened from table)
    case 'load':
      return `/dispatcher/loads/${entityId}`;
    case 'vehicle':
      return `/dispatcher/fleet`; // Opens fleet page (vehicle detail sheets opened from table)
    default:
      return null;
  }
}

export function getCategoryLabel(cat: ShieldFindingCategory) {
  switch (cat) {
    case 'HOS':
      return 'HOS';
    case 'DRIVERS':
      return 'Drivers';
    case 'VEHICLES':
      return 'Vehicles';
    case 'LOADS':
      return 'Loads';
  }
}

export function formatTimestamp(ts: string | null) {
  if (!ts) return 'Never';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHrs < 1) return 'Just now';
  if (diffHrs < 24) return `${diffHrs}h ago`;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatNextScheduled(ts: string | undefined) {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  if (d <= now) return null;

  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();

  const timeStr = d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  if (isToday) return `Today at ${timeStr}`;
  if (isTomorrow) return `Tomorrow at ${timeStr}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` at ${timeStr}`;
}
