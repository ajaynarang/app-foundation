import { Controller, Post, Param, Body, NotFoundException, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '@appshore/platform/auth/guards/jwt-auth.guard';
import { TenantGuard } from '@appshore/platform/auth/guards/tenant.guard';
import { RolesGuard } from '@appshore/platform/auth/guards/roles.guard';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { UserRole } from '@appshore/db';
import { HitlChallengeService } from '../agent-contract/hitl-challenge.service';
import { PinService } from '@appshore/platform/auth/pin.service';
import { AUTH_THROTTLE_LIMIT_STRICT, AUTH_THROTTLE_TTL_MS } from '@appshore/platform/constants/auth.constants';
import { PrismaService } from '@appshore/platform/infrastructure/database/prisma.service';
import { StepUpDto } from './dto/step-up.dto';
import { fieldError, invalidState } from '@appshore/kernel/shared/errors/api-errors';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import { HitlStepUpResultResponse } from '../openapi.responses';

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

  @Post(':token/step-up')
  @HttpCode(HttpStatus.OK)
  // A PIN is 4 digits: hold guesses to the PIN login's limit (counted per signed-in user), not the global one.
  @Throttle({ default: { ttl: AUTH_THROTTLE_TTL_MS, limit: AUTH_THROTTLE_LIMIT_STRICT } })
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
  @ApiResult(HitlStepUpResultResponse)
  async complete(@Param('token') token: string, @Body() dto: StepUpDto, @CurrentUser() user: { dbId: number }) {
    const record = await this.prisma.user.findUnique({
      where: { id: user.dbId },
      select: { id: true, pinHash: true },
    });
    if (!record) throw new NotFoundException('User not found');
    if (!record.pinHash) {
      throw invalidState('No PIN set. Set one in your profile before using step-up.');
    }

    const ok = await this.pinService.verifyPin(dto.pin, record.pinHash);
    if (!ok) throw fieldError('pin', 'That PIN is not right');

    if (!(await this.challenges.markStepUpCompleted(token, user.dbId))) {
      throw new NotFoundException('Challenge not found, already used or expired');
    }
    return { status: 'step_up_verified' };
  }
}
