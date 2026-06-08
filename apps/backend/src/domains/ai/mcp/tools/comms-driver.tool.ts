import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SmsService } from '../../../../infrastructure/sms/sms.service';
import { EntityResolver, errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';

/**
 * Send-Driver-Message MCP Tool — sends an SMS to a single driver.
 *
 * Tenant isolation:
 *   - _tenantId is injected by McpToolService from the authenticated session.
 *     Never sourced from the LLM. Absent = early error.
 *
 * Scope:
 *   - RequiresScope('comms:send') — standard HITL tier for outbound comms.
 *
 * Driver resolution: accepts driverName, resolves via EntityResolver to get
 * the driver's phone number. Normalizes to E.164 (prepends +1 for 10-digit
 * US numbers; leaves numbers already starting with '+' unchanged).
 *
 * Delegates to SmsService.sendSms which is backed by Twilio. Returns false
 * (not configured / provider rejected) vs throws (transient error).
 */

const SendDriverMessageSchema = z.object({
  driverName: z.string().min(1).describe('Driver name or partial match, e.g. "John Smith"'),
  message: z.string().min(1).max(1000).describe('SMS body. Keep under 160 chars when possible.'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  // _userId accepted for future provenance tracking; SmsService.sendSms doesn't persist it.
  _userId: z.string().optional().describe('Internal: injected by system'),
});

type SendDriverMessageArgs = z.infer<typeof SendDriverMessageSchema>;

@Injectable()
export class CommsDriverTool {
  private readonly resolver: EntityResolver;

  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
  ) {
    this.resolver = new EntityResolver(prisma);
  }

  @RequiresScope('comms:send')
  @Tool({
    name: ToolNames.SEND_DRIVER_MESSAGE,
    description:
      'Send a direct SMS to a single driver. Use when dispatcher says "text John to call the shipper" or "SMS Smith: pickup moved to 2pm." Max 1,000 chars (Twilio splits beyond 160). Driver must have a phone number on file. Do NOT use to broadcast to multiple drivers (use bulk-broadcast-drivers). Requires user confirmation before executing.',
    parameters: SendDriverMessageSchema,
  })
  async sendDriverMessage(args: SendDriverMessageArgs) {
    const { _tenantId, _userId: _, driverName, message } = args;

    if (!_tenantId) return errorResponse('Session error: no tenant context.');

    const res = await this.resolver.resolveDriver(driverName, _tenantId);
    if ('error' in res) return errorResponse(res.error);

    const driver = res.data;

    if (!driver.phone) {
      return errorResponse(`Driver ${driver.name} has no phone number on file.`);
    }

    const normalized = driver.phone.startsWith('+') ? driver.phone : `+1${driver.phone.replace(/[^0-9]/g, '')}`;

    const sent = await this.smsService.sendSms(normalized, message);
    if (!sent) {
      return errorResponse('SMS not delivered (provider not configured or rejected).');
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            driverName: driver.name,
            phone: normalized,
            message: `Message sent to ${driver.name} at ${normalized}.`,
          }),
        },
      ],
    };
  }
}
