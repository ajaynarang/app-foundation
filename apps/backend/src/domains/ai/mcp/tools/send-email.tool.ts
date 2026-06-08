import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { EmailService } from '../../../../infrastructure/notification/services/email.service';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';

/**
 * send-email MCP tool — used by Sally's Desk responsibilities when an agent
 * has been approved (auto or human) to reach out via email.
 *
 * Tenant RLS: `_tenantId` is injected by McpToolService at invocation time
 * from the authenticated session (or from Desk InvocationContext when called
 * from the Desk path). It is REQUIRED in the schema — the model cannot omit
 * it, and if an upstream caller forgets to inject it Zod validation fails
 * before the tool ever runs.
 *
 * Return shape differs from read-only MCP tools: instead of the
 * `{ content:[{type:'text',text:...}] }` envelope, the Desk engine expects
 * the raw action-outcome shape so it can update episode state directly:
 *   `{ ok: true,  messageId: string | null }`
 *   `{ ok: false, error: string, retriable: boolean }`
 *
 * `retriable` is a best-effort heuristic: transient upstream failures (5xx,
 * timeouts, ECONNRESET) are worth retrying; anything else (invalid from
 * address, provider auth error, bad recipient) is a hard failure and the
 * engine will mark the episode `failed` instead of re-enqueuing.
 */
export const SendEmailParamsSchema = z.object({
  to: z.string().email().describe('Recipient email address'),
  subject: z.string().min(1).max(200).describe('Email subject line'),
  body: z
    .string()
    .min(1)
    .max(20_000)
    .describe('Plain-text email body. Used for both text and html parts (no HTML rendering applied).'),
  replyTo: z
    .string()
    .email()
    .optional()
    .describe(
      'Optional Reply-To address. Customer replies route here instead of the default FROM. Used by Desk AR Follow-up to steer replies to the tenant supervisor rather than noreply@.',
    ),
  // Injected by McpToolService from the authenticated session — required.
  _tenantId: z.number().int().positive().describe('Internal: injected by system — tenant context'),
  _userId: z.string().optional().describe('Internal: injected by system — acting user (if any)'),
});

export type SendEmailParams = z.infer<typeof SendEmailParamsSchema>;

export type SendEmailResult = { ok: true; messageId: string | null } | { ok: false; error: string; retriable: boolean };

@Injectable()
export class SendEmailTool {
  constructor(private readonly email: EmailService) {}

  @RequiresScope('comms:send')
  @Tool({
    name: 'send-email',
    description:
      "Send a plain-text email. Used by Sally's Desk responsibilities when an action has been approved to communicate with a customer, broker, or driver. The body is sent as both text and html parts — do not include HTML markup.",
    parameters: SendEmailParamsSchema,
  })
  async execute(args: SendEmailParams): Promise<SendEmailResult> {
    try {
      await this.email.sendEmail({
        to: args.to,
        subject: args.subject,
        text: args.body,
        html: args.body,
        ...(args.replyTo ? { replyTo: args.replyTo } : {}),
      });
      // EmailService.sendEmail returns void — providers don't surface the
      // provider-side messageId through our current interface, so we return
      // null. If/when EmailService is upgraded to return `{ id }`, plumb it
      // through here.
      return { ok: true, messageId: null };
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      const retriable = /5\d\d|timeout|econnreset/i.test(e.message);
      return { ok: false, error: e.message, retriable };
    }
  }
}
