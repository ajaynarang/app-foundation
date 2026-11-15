import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  Body,
  Logger,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AdminTicketListQueryDto, TicketListQueryDto } from './dto/ticket-list-query.dto';
import { ListQueryDto } from '@appshore/kernel/shared/utils/query-dto';
import { ApiResult } from '@appshore/platform/shared/openapi/api-result';
import {
  SupportStatsResponse,
  SupportTenantListResponse,
  SupportTicketDetailResponse,
  SupportTicketListResponse,
  SupportTicketMessageResponse,
  SupportTicketResponse,
} from './openapi.responses';

const TICKET_ID_PARAM = {
  name: 'id',
  description: 'Ticket numeric id (listed in id-boundary.allowlist.json)',
} as const;
@ApiTags('Support')
@Controller('support')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(private readonly supportService: SupportService) {}

  // ─── Tenant endpoints ───

  @Post('tickets')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a support ticket' })
  @ApiResult(SupportTicketResponse, HttpStatus.CREATED)
  async createTicket(@CurrentUser() user: any, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(user.tenantDbId, user.dbId, dto);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List my support tickets' })
  @ApiResult(SupportTicketListResponse)
  async listMyTickets(@CurrentUser() user: any, @Query() query: TicketListQueryDto) {
    return this.supportService.listTicketsForTenant(user.tenantDbId, {
      status: query.status,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get ticket detail' })
  @ApiParam(TICKET_ID_PARAM)
  @ApiResult(SupportTicketDetailResponse)
  async getTicket(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.supportService.getTicket(id, user.tenantDbId);
  }

  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to a ticket' })
  @ApiParam(TICKET_ID_PARAM)
  @ApiResult(SupportTicketMessageResponse, HttpStatus.CREATED)
  async addMessage(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @Body() dto: CreateMessageDto) {
    return this.supportService.addMessage(id, user.dbId, 'user', dto, user.tenantDbId);
  }

  // ─── Super Admin endpoints ───

  @Get('admin/tickets')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tickets across tenants (super admin)' })
  @ApiResult(SupportTicketListResponse)
  async listAllTickets(@Query() query: AdminTicketListQueryDto) {
    return this.supportService.listAllTickets({
      tenantId: query.tenantId,
      status: query.status,
      priority: query.priority,
      category: query.category,
      search: query.q,
      limit: query.limit,
      cursor: query.cursor,
    });
  }

  @Get('admin/tickets/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get ticket detail (super admin)' })
  @ApiParam(TICKET_ID_PARAM)
  @ApiResult(SupportTicketDetailResponse)
  async getAdminTicket(@Param('id', ParseIntPipe) id: number) {
    return this.supportService.getTicket(id, 0, true);
  }

  @Put('admin/tickets/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update ticket status/priority (super admin)' })
  @ApiParam(TICKET_ID_PARAM)
  @ApiResult(SupportTicketResponse)
  async updateTicket(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketDto) {
    return this.supportService.updateTicket(id, dto);
  }

  @Post('admin/tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Reply to ticket or add internal note (super admin)',
  })
  @ApiParam(TICKET_ID_PARAM)
  @ApiResult(SupportTicketMessageResponse, HttpStatus.CREATED)
  async addAdminMessage(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Body() dto: CreateMessageDto,
  ) {
    return this.supportService.addMessage(id, user.dbId, 'admin', dto, 0, true);
  }

  @Get('admin/stats')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get support ticket stats (super admin)' })
  @ApiResult(SupportStatsResponse)
  async getStats() {
    return this.supportService.getStats();
  }

  @Get('admin/tenants')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Tenants that have opened a ticket, by name (a picker: cursor list with q)' })
  @ApiResult(SupportTenantListResponse)
  async getTenants(@Query() query: ListQueryDto) {
    return this.supportService.getTenants(query);
  }
}
