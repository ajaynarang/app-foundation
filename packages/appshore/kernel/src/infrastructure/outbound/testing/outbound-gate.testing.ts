import { OUTBOUND_MODE } from '../outbound-mode';
import type { EmailEnvelope, OutboundGate, OutboundTarget } from '../outbound-gate.port';

/**
 * Gates for unit tests, so a sender's spec does not need Prisma.
 *
 * - `allowAllOutboundGate()`: `live` mode, every send passes untouched. What every spec that is not about the gate
 *   binds.
 * - `holdAllOutboundGate()`: `allowlist` mode with an empty list, every send held back. Each held-back call is pushed
 *   onto `held`, so a spec can assert the sender asked and stopped.
 */
export function allowAllOutboundGate(): OutboundGate {
  return {
    getMode: () => OUTBOUND_MODE.LIVE,
    isLive: () => true,
    gateEmail: async <T extends EmailEnvelope>(message: T) => message,
    allowPhone: async () => true,
    allowUser: async () => true,
    allowUrl: async () => true,
    wouldAllow: async () => true,
    markSms: (text) => text,
    markPushTitle: (title) => title,
  };
}

export interface HoldAllOutboundGate extends OutboundGate {
  held: Array<{ method: string; recipient: string | number }>;
}

export function holdAllOutboundGate(): HoldAllOutboundGate {
  const held: HoldAllOutboundGate['held'] = [];
  return {
    held,
    getMode: () => OUTBOUND_MODE.ALLOWLIST,
    isLive: () => false,
    gateEmail: async <T extends EmailEnvelope>(message: T) => {
      held.push({ method: 'gateEmail', recipient: String(message.to) });
      return null;
    },
    allowPhone: async (phone) => {
      held.push({ method: 'allowPhone', recipient: phone });
      return false;
    },
    allowUser: async (userId) => {
      held.push({ method: 'allowUser', recipient: userId });
      return false;
    },
    allowUrl: async (url) => {
      held.push({ method: 'allowUrl', recipient: url });
      return false;
    },
    wouldAllow: async (_target: OutboundTarget) => false,
    markSms: (text) => text,
    markPushTitle: (title) => title,
  };
}
