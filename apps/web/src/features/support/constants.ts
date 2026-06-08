import type { SupportStatus, SupportPriority, SupportCategory } from './types';

export const STATUS_VARIANTS: Record<SupportStatus, { label: string; className: string }> = {
  OPEN: {
    label: 'Open',
    className: 'bg-muted text-foreground',
  },
  IN_PROGRESS: {
    label: 'In Progress',
    className: 'bg-muted text-foreground',
  },
  WAITING_ON_CUSTOMER: {
    label: 'Waiting',
    className: 'bg-muted text-foreground',
  },
  RESOLVED: {
    label: 'Resolved',
    className: 'bg-muted text-foreground',
  },
  CLOSED: {
    label: 'Closed',
    className: 'bg-muted text-muted-foreground',
  },
};

export const PRIORITY_VARIANTS: Record<SupportPriority, { label: string; className: string }> = {
  CRITICAL: {
    label: 'Critical',
    className: 'bg-red-500/10 text-red-500 border-red-500/20',
  },
  HIGH: {
    label: 'High',
    className: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  },
  MEDIUM: {
    label: 'Medium',
    className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  },
  LOW: {
    label: 'Low',
    className: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
};

export const CATEGORY_LABELS: Record<SupportCategory, string> = {
  BILLING: 'Billing',
  TECHNICAL: 'Technical',
  FEATURE_REQUEST: 'Feature Request',
  ACCOUNT: 'Account',
  INTEGRATION: 'Integration',
  GENERAL: 'General',
};

export const CATEGORY_BADGE_CLASS: Record<SupportCategory, string> = {
  BILLING: 'bg-muted text-foreground',
  TECHNICAL: 'bg-muted text-foreground',
  FEATURE_REQUEST: 'bg-muted text-foreground',
  ACCOUNT: 'bg-muted text-foreground',
  INTEGRATION: 'bg-muted text-foreground',
  GENERAL: 'bg-muted text-muted-foreground',
};
