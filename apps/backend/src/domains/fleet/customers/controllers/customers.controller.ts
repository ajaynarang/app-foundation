import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { BaseTenantController } from '../../../../shared/base/base-tenant.controller';
import { CurrentUser } from '../../../../auth/decorators/current-user.decorator';
import { Roles } from '../../../../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CustomersService } from '../services/customers.service';
import { CustomerContactsService } from '../services/customer-contacts.service';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateContactDto,
  UpdateContactDto,
  DeactivateCustomerDto,
} from '../dto';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly contactsService: CustomerContactsService,
  ) {
    super(prisma);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a customer' })
  async create(@CurrentUser() user: any, @Body() body: CreateCustomerDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.create({ ...body, tenantId: tenantDbId });
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List all customers' })
  async list(@CurrentUser() user: any, @Query('includeInactive') includeInactive?: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.findAll(tenantDbId, includeInactive === 'true');
  }

  @Get(':customer_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get customer details with contacts' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async get(@CurrentUser() user: any, @Param('customer_id') customerId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.findOne(customerId, tenantDbId);
  }

  @Put(':customer_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update customer' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async update(@CurrentUser() user: any, @Param('customer_id') customerId: string, @Body() body: UpdateCustomerDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.update(customerId, body, tenantDbId);
  }

  @Post(':customer_id/invite')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Invite a customer contact to the portal' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async inviteCustomer(
    @CurrentUser() user: any,
    @Param('customer_id') customerId: string,
    @Body() body: { email: string; firstName: string; lastName: string },
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.inviteContact(customerId, {
      ...body,
      tenantId: tenantDbId,
      invitedBy: user.userId,
    });
  }

  @Post(':customer_id/deactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate a customer' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async deactivate(
    @Param('customer_id') customerId: string,
    @Body() dto: DeactivateCustomerDto,
    @CurrentUser() user: any,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.deactivate(customerId, tenantDbId, user.dbId, dto.reason);
  }

  @Post(':customer_id/reactivate')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Reactivate an inactive customer' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async reactivate(@Param('customer_id') customerId: string, @CurrentUser() user: any) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customersService.reactivate(customerId, tenantDbId, user.dbId);
  }

  // --- Contact endpoints ---

  @Get(':customer_id/contacts')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List contacts for a customer' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async listContacts(@CurrentUser() user: any, @Param('customer_id') customerId: string) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.contactsService.findAll(customerId, tenantDbId);
  }

  @Post(':customer_id/contacts')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Add a contact to a customer' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  async createContact(
    @CurrentUser() user: any,
    @Param('customer_id') customerId: string,
    @Body() body: CreateContactDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.contactsService.create(customerId, tenantDbId, body);
  }

  @Put(':customer_id/contacts/:contact_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a contact' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  @ApiParam({ name: 'contact_id', description: 'Contact ID' })
  async updateContact(
    @CurrentUser() user: any,
    @Param('customer_id') customerId: string,
    @Param('contact_id') contactId: string,
    @Body() body: UpdateContactDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.contactsService.update(contactId, tenantDbId, body, customerId);
  }

  @Delete(':customer_id/contacts/:contact_id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Remove a contact (soft delete)' })
  @ApiParam({ name: 'customer_id', description: 'Customer ID' })
  @ApiParam({ name: 'contact_id', description: 'Contact ID' })
  async deleteContact(
    @CurrentUser() user: any,
    @Param('customer_id') customerId: string,
    @Param('contact_id') contactId: string,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.contactsService.remove(contactId, tenantDbId, customerId);
  }
}
