import { Injectable, Logger } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { SmsService } from '../../../../infrastructure/sms/sms.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * send-sms MCP tool — used by Sally's Desk responsibilities when an agent
 * has been approved (auto or human) to reach out via SMS.
 *
 * Tenant RLS: `_tenantId` is injected by McpToolService at invocation time
 * from the authenticated session (or from Desk InvocationContext when called
 * from the Desk path). Required in the schema — an upstream caller that
 * forgets to inject it fails Zod validation before the tool ever runs.
 *
 * Return shape (same contract as `send-email`):
 *   `{ ok: true,  messageId: string | null }`
 *   `{ ok: false, error: string, retriable: boolean }`
 *
 * In dev, Twilio is typically not configured. Rather than silently retry,
 * we translate `sendSms → false` into a non-retriable `{ ok: false,
 * error: 'sms_not_configured' }` so the Desk engine marks the episode failed
 * once instead of re-enqueuing.
 */
export const SendSmsParamsSchema = z.object({
  to: z
    .string()
    // PR-2 review (nitpick): tighten to strict E.164 so we don't waste Twilio
    // API calls on non-compliant numbers. The model should normalize upstream.
    .regex(/^\+[1-9]\d{1,14}$/, 'Phone number must be E.164 (e.g., +15551234567) — no spaces, dashes, or parentheses.')
    .describe('Recipient phone number in E.164 format (e.g., +15551234567). No spaces, dashes, or parentheses.'),
  message: z
    .string()
    .min(1)
    .max(1600)
    .describe('SMS body. Max 1600 chars — Twilio will split into concatenated segments beyond 160.'),
  // Injected by McpToolService from the authenticated session — required.
  _tenantId: z.number().int().positive().describe('Internal: injected by system — tenant context'),
  _userId: z.string().optional().describe('Internal: injected by system — acting user (if any)'),
});

export type SendSmsParams = z.infer<typeof SendSmsParamsSchema>;

export type SendSmsResult = { ok: true; messageId: string | null } | { ok: false; error: string; retriable: boolean };

@Injectable()
export class SendSmsTool {
  private readonly logger = new Logger(SendSmsTool.name);

  constructor(private readonly sms: SmsService) {}

  @RequiresScope('comms:send')
  @Tool({
    name: 'send-sms',
    description:
      "Send a short SMS. Used by Sally's Desk when an action has been approved to notify a driver, customer, or broker. Keep the body under 160 chars when possible — longer messages split into multiple Twilio segments.",
    parameters: SendSmsParamsSchema,
  })
  async execute(args: SendSmsParams): Promise<SendSmsResult> {
    try {
      const ok = await this.sms.sendSms(args.to, args.message);
      if (!ok) {
        // SmsService returns false for both "not configured" and
        // "provider rejected". Neither is worth retrying at the agent level
        // — the first needs human config, the second needs a new message.
        return {
          ok: false,
          error: 'sms_not_configured',
          retriable: false,
        };
      }
      // Twilio's `messages.create` returns a SID but SmsService swallows it
      // today. Return null until we surface it through the service layer.
      return { ok: true, messageId: null };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const retriable = /5\d\d|timeout|econnreset/i.test(e.message);
      this.logger.warn(`send-sms failed: ${e.message}`);
      return { ok: false, error: e.message, retriable };
    }
  }
}
