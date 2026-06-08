import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { APPROVAL_SCOPES, type ApprovalScope, type HandoffCounts } from '@app/shared-types';

import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';

import { ApprovalService, resolveApprovalScope } from './approval.service';
import { DecideApprovalDto } from './dto/decide-approval.dto';

/**
 * HTTP surface for Desk approvals. Consumed by the Desk UI's
 * pending-approval queue on /dispatcher/desk/responsibilities/<key>.
 *
 * Auth: Dispatcher + Admin + SuperAdmin. Tenant scoping happens via
 * base controller — every read returns only this tenant's approvals,
 * every write asserts the approval belongs to this tenant first.
 */
@ApiTags('Desk — Approvals')
@ApiBearerAuth()
@Controller('desk/approvals')
@Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.SUPER_ADMIN)
export class ApprovalController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly approvals: ApprovalService,
  ) {
    super(prisma);
  }

  @Get()
  @ApiOperation({
    summary: 'List pending Desk approvals for the tenant (queue view)',
  })
  @ApiQuery({ name: 'scope', required: false, enum: APPROVAL_SCOPES })
  @ApiQuery({ name: 'limit', required: false })
  async listPending(@CurrentUser() user: any, @Query('limit') limit?: string, @Query('scope') scope?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    const parsedLimit = limit ? Math.min(Math.max(parseInt(limit, 10), 1), 100) : 50;
    if (scope !== undefined && !APPROVAL_SCOPES.includes(scope as ApprovalScope)) {
      throw new BadRequestException(`Invalid scope ${scope}. Expected one of: ${APPROVAL_SCOPES.join(', ')}`);
    }
    const resolvedScope = resolveApprovalScope(scope as ApprovalScope | undefined, user.role);
    return this.approvals.listPending(tenantDbId, {
      limit: parsedLimit,
      scope: resolvedScope,
      currentUserId: user.dbId,
    });
  }

  /**
   * Cheap aggregate counts for the Handoffs tab's Mine/All segmented
   * control. Replaces the pattern of fetching both full mine+all lists
   * just to show tab badges — 4 COUNTs instead of 2×100-row payloads.
   *
   * Route registered BEFORE any `:id` param route so NestJS doesn't
   * greedily match 'counts' as a UUID.
   */
  @Get('counts')
  @ApiOperation({
    summary: 'Handoff counts (Mine/All × waiting/escalated) for the Handoffs tab segmented control',
  })
  async counts(@CurrentUser() user: any): Promise<HandoffCounts> {
    const tenantDbId = await this.getTenantDbId(user);
    return this.approvals.countPending(tenantDbId, user.dbId);
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Claim an approval for the current dispatcher. First-write-wins; returns 409 if already claimed.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async claim(@CurrentUser() user: any, @Param('id', new ParseUUIDPipe()) id: string) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertApprovalInTenant(id, tenantDbId);
    return this.approvals.claim(id, user.dbId);
  }

  @Post(':id/decide')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Decide a pending approval: APPROVE / EDIT / REJECT (optionally terminate the episode)',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  async decide(
    @CurrentUser() user: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: DecideApprovalDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    await this.assertApprovalInTenant(id, tenantDbId);
    return this.approvals.decide({
      approvalId: id,
      userId: user.dbId,
      decision: body.decision,
      editedAction: body.editedAction,
      rejectionReason: body.rejectionReason,
      terminate: body.terminate,
    });
  }

  /**
   * Load the approval + the parent episode tenant in one query and fail
   * fast if it doesn't belong to the caller's tenant. Cheaper than joining
   * tenantId into the claim/decide WHERE clauses because those already
   * assume uniqueness by approval id.
   */
  private async assertApprovalInTenant(approvalId: string, tenantDbId: number) {
    const approval = await this.prisma.deskApproval.findUnique({
      where: { id: approvalId },
      select: { episode: { select: { tenantId: true } } },
    });
    if (!approval || approval.episode.tenantId !== tenantDbId) {
      // Either doesn't exist, or cross-tenant — same 404 for both.
      throw new NotFoundException('Approval not found');
    }
  }
}
