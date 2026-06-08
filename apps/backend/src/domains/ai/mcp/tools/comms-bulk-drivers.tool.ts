import { Injectable } from '@nestjs/common';
import { Tool } from '@rekog/mcp-nest';
import { createHash } from 'crypto';
import { z } from 'zod';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { SmsService } from '../../../../infrastructure/sms/sms.service';
import { SallyCacheService } from '../../../../infrastructure/cache/sally-cache.service';
import { buildKey } from '../../../../infrastructure/cache/cache-key.constants';
import { DomainEventService } from '../../../../infrastructure/events/domain-event.service';
import { SALLY_EVENTS } from '../../../../infrastructure/events/sally-events.constants';
import { errorResponse } from './utils/entity-resolver';
import { RequiresScope } from '../../agent-contract/requires-scope.decorator';
import { ToolNames } from '../../agent-contract/tool-names.constants';
import { parseHitlTokenOrNull } from '../../agent-contract/hitl-challenge.service';

/**
 * Bulk-Broadcast-Drivers MCP Tool.
 * Sends the same SMS to multiple drivers filtered by status/region.
 * Hourly Redis counter gates bulk sends at threshold=10; over-threshold
 * calls issue a hitl_challenge token requiring re-call with _confirmToken.
 * Hard cap: 500 drivers per broadcast.
 */

const DriverFilterSchema = z.object({
  status: z
    .enum(['active', 'all', 'assigned', 'unassigned'])
    .optional()
    .describe('Driver lifecycle/assignment status filter'),
  region: z.string().optional().describe('Home terminal state code (2 letters), e.g. "TX"'),
});

const BulkBroadcastDriversSchema = z.object({
  filter: DriverFilterSchema.describe('Which drivers to include in the broadcast'),
  message: z.string().min(1).max(1000).describe('SMS body (Twilio splits >160 chars into segments)'),
  _confirmToken: z.string().optional().describe('Bulk-confirm token from a previous call'),
  _tenantId: z.number().optional().describe('Internal: injected by system'),
  _userId: z.string().optional().describe('Internal: injected by system'),
  _principalKind: z
    .enum(['user', 'desk_responsibility', 'oauth_client', 'api_key'])
    .optional()
    .describe('Internal: injected by pipeline'),
});

type BulkBroadcastDriversArgs = z.infer<typeof BulkBroadcastDriversSchema>;

@Injectable()
export class CommsBulkDriversTool {
  constructor(
    private readonly prisma: PrismaService,
    private readonly smsService: SmsService,
    private readonly cache: SallyCacheService,
    private readonly events: DomainEventService,
  ) {}

  @RequiresScope('comms:send')
  @Tool({
    name: ToolNames.BULK_BROADCAST_DRIVERS,
    description:
      'Broadcast the same SMS to multiple drivers at once. Use when dispatcher says "text all active drivers: weather alert in TX, reduce speed" or "push to unassigned drivers: new fuel card policy effective Monday." Filter picks recipients (status: active/all/assigned/unassigned; optional region). If the broadcast fan-out plus your past-hour volume exceeds 10 recipients, the tool returns a bulk_confirmation_required response with a token — call again passing _confirmToken to proceed. Hard cap: 500 drivers per broadcast. Do NOT use for per-driver messages (use send-driver-message). Requires user confirmation before executing.',
    parameters: BulkBroadcastDriversSchema,
  })
  async bulkBroadcastDrivers(args: BulkBroadcastDriversArgs) {
    if (!args._tenantId) return errorResponse('Session error: no tenant context.');
    if (!args._userId) return errorResponse('Acting user required.');

    const user = await this.prisma.user.findFirst({
      where: { firebaseUid: args._userId, tenantId: args._tenantId },
      select: { id: true },
    });
    if (!user) return errorResponse('Acting user not found.');

    const drivers = await this.resolveDrivers(args._tenantId, args.filter);
    if (drivers.length === 0) return errorResponse('No drivers matched the filter.');

    const eligible = drivers.filter((d) => !!d.phone);
    if (eligible.length === 0) return errorResponse('No matching drivers have a phone number on file.');

    const argsDigest = this.buildArgsDigest(
      eligible.map((d) => d.driverId),
      args.message,
    );

    if (args._confirmToken) {
      const ok = await this.consumeBulkToken(args._confirmToken, args._tenantId, user.id, argsDigest);
      if (!ok) return errorResponse('Bulk confirmation token invalid or expired.');
      await this.events.emit(SALLY_EVENTS.AGENT_HITL_CHALLENGE_COMPLETED, String(args._tenantId), {
        token: args._confirmToken,
        toolName: ToolNames.BULK_BROADCAST_DRIVERS,
      });
    } else {
      const preflight = await this.bulkPrecheck(args._tenantId, user.id, eligible.length, args._principalKind);
      if (preflight.requiresConfirm) {
        const token = await this.issueBulkToken(args._tenantId, user.id, argsDigest);
        await this.events.emit(SALLY_EVENTS.AGENT_HITL_CHALLENGE_ISSUED, String(args._tenantId), {
          token,
          toolName: ToolNames.BULK_BROADCAST_DRIVERS,
          tier: 'standard',
          stepUpRequired: false,
        });
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                status: 'bulk_confirmation_required',
                token,
                ttlSeconds: 300,
                recipientCount: eligible.length,
                currentHourCount: preflight.currentHourCount,
                threshold: preflight.threshold,
                message: `This broadcast would reach ${eligible.length} driver(s). Your past-hour bulk volume plus this send exceeds the ${preflight.threshold} threshold. Call bulk-broadcast-drivers again with _confirmToken='${token}' to proceed.`,
              }),
            },
          ],
        };
      }
    }

    const results = await Promise.allSettled(
      eligible.map((d) => this.smsService.sendSms(this.normalize(d.phone ?? ''), args.message)),
    );
    const sent = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
    const failed = eligible.length - sent;

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            recipientCount: eligible.length,
            sent,
            failed,
            message: `Broadcast sent to ${sent} of ${eligible.length} drivers${failed > 0 ? ` (${failed} failed)` : ''}.`,
          }),
        },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async resolveDrivers(tenantId: number, filter: z.infer<typeof DriverFilterSchema>) {
    const where: Record<string, unknown> = { tenantId };
    if (filter.status === 'active') where.status = 'ACTIVE';
    if (filter.region) where.homeTerminalState = filter.region.toUpperCase();

    const drivers = await this.prisma.driver.findMany({
      where,
      select: {
        driverId: true,
        name: true,
        phone: true,
        assignedVehicleId: true,
      },
      take: 500,
    });

    if (filter.status === 'assigned') return drivers.filter((d) => !!d.assignedVehicleId);
    if (filter.status === 'unassigned') return drivers.filter((d) => !d.assignedVehicleId);
    return drivers;
  }

  private buildArgsDigest(driverIds: string[], message: string): string {
    return createHash('sha256')
      .update([...driverIds].sort().join(','))
      .update('|')
      .update(message)
      .digest('hex');
  }

  private async bulkPrecheck(
    tenantId: number,
    userId: number,
    recipientCount: number,
    principalKind?: 'user' | 'desk_responsibility' | 'oauth_client' | 'api_key',
  ) {
    const hourBucket = Math.floor(Date.now() / 1000 / 3600);
    const key = buildKey('sally:comms', 'bulk', tenantId, userId, hourBucket);
    // First-party principals (user, desk) get a higher threshold than third-party (oauth, api-key).
    const threshold = principalKind === 'oauth_client' || principalKind === 'api_key' ? 5 : 10;
    const newTotal = await this.cache.increment(key, recipientCount, 3600);
    return {
      requiresConfirm: newTotal > threshold,
      currentHourCount: newTotal,
      threshold,
    };
  }

  private async issueBulkToken(tenantId: number, userId: number, argsDigest: string): Promise<string> {
    const row = await this.prisma.hitlChallenge.create({
      data: {
        tenantId,
        principalKind: 'user',
        principalId: `user:${userId}`,
        toolName: ToolNames.BULK_BROADCAST_DRIVERS,
        argsDigest,
        scopeRequired: 'comms:send:bulk',
        tier: 'standard',
        stepUpRequired: false,
        stepUpUserId: userId,
        expiresAt: new Date(Date.now() + 300 * 1000),
      },
      select: { id: true },
    });
    return String(row.id);
  }

  private async consumeBulkToken(token: string, tenantId: number, userId: number, argsDigest: string) {
    const id = parseHitlTokenOrNull(token);
    if (id === null) return null;
    const row = await this.prisma.hitlChallenge.findFirst({
      where: {
        id,
        tenantId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!row) return null;
    if (row.principalId !== `user:${userId}`) return null;
    if (row.toolName !== ToolNames.BULK_BROADCAST_DRIVERS) return null;
    if (row.argsDigest !== argsDigest) return null;
    await this.prisma.hitlChallenge.update({
      where: { id },
      data: { consumedAt: new Date() },
    });
    return row;
  }

  private normalize(phone: string): string {
    return phone.startsWith('+') ? phone : `+1${phone.replace(/[^0-9]/g, '')}`;
  }
}
