import type { NotificationType } from '@appshore/db';

export interface Recipient {
  id: number;
  userId: string;
  firebaseUid: string | null;
  email: string | null;
  phone: string | null;
}

/** A recipient may carry its own copy — an app uses this for a guardian reading a child's notification. */
export interface DispatchRecipient extends Recipient {
  title?: string;
  metadata?: Record<string, any>;
}

export interface DispatchParams {
  tenantId: number;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  iconType?: string;
  metadata?: Record<string, any>;
  /** Same-type notifications inside one window collapse into one in-app row per scope. */
  groupScope?: string;
  recipients: DispatchRecipient[];
}
