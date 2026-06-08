import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../../auth/decorators/current-user.decorator';
import { BaseTenantController } from '../../../shared/base/base-tenant.controller';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { CustomFieldsService } from './custom-fields.service';
import { CreateCustomFieldDefinitionDto } from './dto/create-custom-field-definition.dto';
import { UpdateCustomFieldDefinitionDto } from './dto/update-custom-field-definition.dto';
import { ReorderCustomFieldDefinitionsDto } from './dto/reorder-custom-field-definitions.dto';

@ApiTags('Custom Fields')
@ApiBearerAuth()
@Controller('custom-fields/definitions')
export class CustomFieldsController extends BaseTenantController {
  constructor(
    prisma: PrismaService,
    private readonly customFieldsService: CustomFieldsService,
  ) {
    super(prisma);
  }

  @Post()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Create a custom field definition' })
  async create(@CurrentUser() user: any, @Body() dto: CreateCustomFieldDefinitionDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customFieldsService.create(tenantDbId, dto);
  }

  @Get()
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER, UserRole.DRIVER)
  @ApiOperation({ summary: 'List custom field definitions by entity type' })
  @ApiQuery({
    name: 'entityType',
    enum: ['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER'],
  })
  async list(@CurrentUser() user: any, @Query('entityType') entityType: string) {
    const validTypes = ['LOAD', 'DRIVER', 'VEHICLE', 'CUSTOMER'];
    if (!validTypes.includes(entityType)) {
      throw new BadRequestException(`entityType must be one of: ${validTypes.join(', ')}`);
    }
    const tenantDbId = await this.getTenantDbId(user);
    return this.customFieldsService.findAll(tenantDbId, entityType);
  }

  @Patch('reorder')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Reorder custom field definitions' })
  async reorder(@CurrentUser() user: any, @Body() dto: ReorderCustomFieldDefinitionsDto) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customFieldsService.reorder(tenantDbId, dto);
  }

  @Patch(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update a custom field definition' })
  @ApiParam({ name: 'id', description: 'Custom field definition ID', type: Number })
  async update(
    @CurrentUser() user: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomFieldDefinitionDto,
  ) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customFieldsService.update(tenantDbId, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Deactivate a custom field definition' })
  @ApiParam({ name: 'id', description: 'Custom field definition ID', type: Number })
  async deactivate(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    return this.customFieldsService.deactivate(tenantDbId, id);
  }

  @Get(':id/usage')
  @Roles(UserRole.DISPATCHER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({
    summary: 'Get usage count for a custom field definition',
  })
  @ApiParam({ name: 'id', description: 'Custom field definition ID', type: Number })
  async getUsage(@CurrentUser() user: any, @Param('id', ParseIntPipe) id: number) {
    const tenantDbId = await this.getTenantDbId(user);
    const count = await this.customFieldsService.getUsageCount(tenantDbId, id);
    return { count };
  }
}
