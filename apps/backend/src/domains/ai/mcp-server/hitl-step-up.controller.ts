import { Controller, Get, Post, Param, Body, BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../../auth/guards/tenant.guard';
import { RolesGuard } from '../../../auth/guards/roles.guard';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { HitlChallengeService, parseHitlTokenOrNull } from '../agent-contract/hitl-challenge.service';
import { PinService } from '../../../auth/pin.service';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { StepUpDto } from './dto/step-up.dto';

@ApiTags('MCP HITL')
@ApiBearerAuth()
@Controller('mcp/hitl')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class HitlStepUpController {
  constructor(
    private readonly challenges: HitlChallengeService,
    private readonly pinService: PinService,
    private readonly prisma: PrismaService,
  ) {}

  @Get(':token')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Fetch context for a pending HITL challenge (for the approval UI)',
    description:
      'Returns redacted args, the calling principal label, expiry, and whether the user has a PIN set. The PIN itself is never returned. Tenant-scoped.',
  })
  async getContext(
    @Param('token') token: string,
    @CurrentUser()
    user: { dbId: number; tenantDbId?: number; role?: UserRole },
  ) {
    const id = parseHitlTokenOrNull(token);
    if (id === null) throw new NotFoundException('Challenge not found');
    const challenge = await this.prisma.hitlChallenge.findUnique({
      where: { id },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');

    if (user.role !== UserRole.SUPER_ADMIN && challenge.tenantId !== user.tenantDbId) {
      throw new NotFoundException('Challenge not found');
    }

    const record = await this.prisma.user.findUnique({
      where: { id: user.dbId },
      select: { pinHash: true },
    });
    const hasPinSet = !!record?.pinHash;

    let callerLabel = challenge.principalId;
    if (challenge.principalKind === 'api_key') {
      const apiKeyIdStr = challenge.principalId.replace(/^apikey:/, '');
      const apiKeyIdNum = parseInt(apiKeyIdStr, 10);
      if (Number.isFinite(apiKeyIdNum) && apiKeyIdNum > 0) {
        const apiKey = await this.prisma.apiKey.findUnique({
          where: { id: apiKeyIdNum },
          select: { name: true },
        });
        if (apiKey) callerLabel = apiKey.name;
      }
    } else if (challenge.principalKind === 'oauth_client') {
      const client = await this.prisma.oAuthClient.findUnique({
        where: { clientId: challenge.principalId.replace(/^oauth:/, '') },
        select: { name: true },
      });
      if (client) callerLabel = client.name;
    }

    const now = Date.now();
    const expired = challenge.expiresAt.getTime() < now;
    const consumed = !!challenge.consumedAt;

    return {
      token: String(challenge.id),
      tool: challenge.toolName,
      tier: challenge.tier,
      scopeRequired: challenge.scopeRequired,
      callerLabel,
      callerKind: challenge.principalKind,
      expiresAt: challenge.expiresAt.toISOString(),
      requiresStepUp: challenge.stepUpRequired,
      stepUpCompleted: challenge.stepUpCompleted,
      consumed,
      expired,
      hasPinSet,
    };
  }

  @Post(':token/step-up')
  @Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Complete PIN step-up for a pending HITL challenge token',
    description:
      'Verifies the user PIN and marks the HITL challenge as step-up-completed, unlocking the sensitive-tier tool call. The agent must then re-present the same token in its next tools/call to execute.',
  })
  @ApiParam({
    name: 'token',
    description: 'HITL challenge token returned by the prior tools/call attempt',
  })
  async complete(@Param('token') token: string, @Body() dto: StepUpDto, @CurrentUser() user: { dbId: number }) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.dbId },
      select: { id: true, pinHash: true },
    });
    if (!record) throw new NotFoundException('User not found');
    if (!record.pinHash) {
      throw new BadRequestException({
        code: 'no_pin',
        message: 'No PIN set. Set one in your profile before using step-up.',
      });
    }

    const ok = await this.pinService.verifyPin(dto.pin, record.pinHash);
    if (!ok) throw new BadRequestException('Invalid PIN');

    await this.challenges.markStepUpCompleted(token, user.dbId);
    return { status: 'step_up_verified' };
  }
}
