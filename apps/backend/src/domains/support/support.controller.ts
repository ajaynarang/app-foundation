import { Controller, Get, Post, Put, Param, Query, Body, Logger, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { UserRole } from '@appshore/db';
import { SupportService } from './support.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { CreateMessageDto } from './dto/create-message.dto';

@ApiTags('Support')
@Controller('support')
@Roles(UserRole.MEMBER, UserRole.ADMIN, UserRole.OWNER)
export class SupportController {
  private readonly logger = new Logger(SupportController.name);

  constructor(private readonly supportService: SupportService) {}

  // ─── Tenant endpoints ───

  @Post('tickets')
  @ApiOperation({ summary: 'Create a support ticket' })
  async createTicket(@CurrentUser() user: any, @Body() dto: CreateTicketDto) {
    return this.supportService.createTicket(user.tenantDbId, user.dbId, dto);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List my support tickets' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listMyTickets(
    @CurrentUser() user: any,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.supportService.listTicketsForTenant(user.tenantDbId, {
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get ticket detail' })
  async getTicket(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any) {
    return this.supportService.getTicket(id, user.tenantDbId);
  }

  @Post('tickets/:id/messages')
  @ApiOperation({ summary: 'Reply to a ticket' })
  async addMessage(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: any, @Body() dto: CreateMessageDto) {
    return this.supportService.addMessage(id, user.dbId, 'user', dto, user.tenantDbId);
  }

  // ─── Super Admin endpoints ───

  @Get('admin/tickets')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tickets across tenants (super admin)' })
  @ApiQuery({ name: 'tenantId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listAllTickets(
    @Query('tenantId') tenantId?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('category') category?: string,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.supportService.listAllTickets({
      tenantId: tenantId ? parseInt(tenantId, 10) : undefined,
      status,
      priority,
      category,
      search,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
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
