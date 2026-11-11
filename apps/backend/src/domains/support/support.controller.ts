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
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from '@appshore/platform/auth/decorators/current-user.decorator';
import { Roles } from '@appshore/platform/auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { AdminTicketListQueryDto, TicketListQueryDto } from './dto/ticket-list-query.dto';

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
  async createTicket(@CurrentUser() user: any, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(user.tenantDbId, user.dbId, dto);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List my support tickets' })
  async listMyTickets(@CurrentUser() user: any, @Query() query: TicketListQueryDto) {
    return this.supportService.listTicketsForTenant(user.tenantDbId, {
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get ticket detail' })
  async getTicket(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.supportService.getTicket(id, user.tenantDbId);
  }

  @Post('tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reply to a ticket' })
  async addMessage(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @Body() dto: CreateMessageDto) {
    return this.supportService.addMessage(id, user.dbId, 'user', dto, user.tenantDbId);
  }

  // ─── Super Admin endpoints ───

  @Get('admin/tickets')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tickets across tenants (super admin)' })
  async listAllTickets(@Query() query: AdminTicketListQueryDto) {
    return this.supportService.listAllTickets({
      tenantId: query.tenantId,
      status: query.status,
      priority: query.priority,
      category: query.category,
      search: query.q,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('admin/tickets/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get ticket detail (super admin)' })
  async getAdminTicket(@Param('id', ParseIntPipe) id: number) {
    return this.supportService.getTicket(id, 0, true);
  }

  @Put('admin/tickets/:id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update ticket status/priority (super admin)' })
  async updateTicket(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTicketDto) {
    return this.supportService.updateTicket(id, dto);
  }

  @Post('admin/tickets/:id/messages')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({
    summary: 'Reply to ticket or add internal note (super admin)',
  })
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
  async getStats() {
    return this.supportService.getStats();
  }

  @Get('admin/tenants')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List tenants that have submitted support tickets' })
  async getTenants() {
    return this.supportService.getTenants();
  }
}
